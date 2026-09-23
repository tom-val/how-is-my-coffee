using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Account;

/// <summary>What one deletion run removed — logged, never serialized.</summary>
public sealed record AccountDeletionSummary(
    int Ratings, int Photos, int Reactions, int Tags, int Follows, int Followers, int OtherRows);

/// <summary>
/// Removes a user and everything tied to them (see "Account deletion" in the contract).
/// <para>
/// The order is chosen so a Lambda that dies half-way leaves the least damage and a retry finishes
/// the job: content first (own ratings, then reactions and companion entries on other people's
/// ratings), then the social graph, then devices, and the <c>USERNAME#</c> lookup and the
/// <c>PROFILE</c> row last. Until the profile is gone the same token + password still authenticate,
/// and every step is idempotent — it re-reads what is left instead of trusting what it did before.
/// </para>
/// </summary>
public sealed class AccountDeleter(CoffeeDb db, RatingStore ratings, IPhotoStorage photos)
{
    /// <summary>Ratings at different places are torn down side by side; see <see cref="DeleteOwnRatingsAsync"/>.</summary>
    private const int PlaceParallelism = 4;

    public async Task<AccountDeletionSummary> DeleteAsync(Dictionary<string, AttributeValue> profile, CancellationToken ct)
    {
        var userId = profile.StrOr(Attr.UserId, string.Empty);
        if (userId.Length == 0) throw new InvalidOperationException("Profile row has no userId.");
        var username = profile.StrOr(Attr.Username, string.Empty);

        var (ratingCount, photoCount) = await DeleteOwnRatingsAsync(userId, ct);
        var reactions = await DeleteReactionsOnOthersAsync(userId, ct);
        var tags = await LeaveCompanionListsAsync(userId, ct);
        var (follows, followers) = await DeleteSocialGraphAsync(userId, ct);
        await DeletePrefixAsync(userId, Keys.PushPrefix, ct);

        // Sweep: whatever is still on the partition apart from the profile (USER#…/PLACE# visits the
        // rating teardown left, rows from the old stack, anything added later that this list forgot).
        var leftovers = (await db.QueryPartitionAsync(Keys.User(userId), ct))
            .Where(i => i.StrOr(Attr.Sk, string.Empty) != Keys.ProfileSk)
            .Select(KeyOf)
            .ToList();
        await db.BatchDeleteAsync(leftovers, ct);

        if (username.Length > 0) await DeleteUsernameLookupAsync(username, userId, ct);

        // Last: from here on the token resolves to no profile and every endpoint answers 401.
        await db.DeleteAsync(Keys.User(userId), Keys.ProfileSk, ct);

        return new AccountDeletionSummary(ratingCount, photoCount, reactions, tags, follows, followers, leftovers.Count);
    }

    /// <summary>
    /// Every rating the user authored, torn down exactly like <c>DELETE /v1/ratings/{id}</c>, plus its
    /// photo. The photo goes first: the USER# copy is the last row a rating teardown removes, so if
    /// anything fails the next attempt still sees the <c>photoKey</c>.
    /// <para>
    /// Places are processed in parallel but the ratings of one place strictly in sequence — each
    /// teardown recomputes that place's stats with a read-then-write, and two of those interleaving on
    /// the same place could leave a stale average behind.
    /// </para>
    /// </summary>
    private async Task<(int Ratings, int Photos)> DeleteOwnRatingsAsync(string userId, CancellationToken ct)
    {
        var own = await db.QueryPrefixAsync(Keys.User(userId), Keys.RatingPrefix, ct);
        var photosDeleted = 0;

        await Parallel.ForEachAsync(
            own.GroupBy(r => r.StrOr(Attr.PlaceId, string.Empty)),
            new ParallelOptions { MaxDegreeOfParallelism = PlaceParallelism, CancellationToken = ct },
            async (place, token) =>
            {
                foreach (var rating in place)
                {
                    var photoKey = rating.Str(Attr.PhotoKey);
                    if (IPhotoStorage.IsOwnedBy(photoKey, userId))
                    {
                        await photos.DeleteAsync(photoKey!, token);
                        Interlocked.Increment(ref photosDeleted);
                    }
                    await ratings.DeleteRatingAsync(rating, token);
                }
            });

        return (own.Count, photosDeleted);
    }

    /// <summary>
    /// The user's likes and comments on other people's ratings. Those rows live on the rating's
    /// partition and nothing indexes them by author, so this is a full table <c>Scan</c> with a filter
    /// — O(table), paid once per account deletion, which is acceptable at this app's scale. If the
    /// table ever grows large, index LIKE#/COMMENT# rows by author on a GSI instead. Their own ratings
    /// are already gone at this point, so every match is on somebody else's rating.
    /// </summary>
    private async Task<int> DeleteReactionsOnOthersAsync(string userId, CancellationToken ct)
    {
        var request = new ScanRequest
        {
            TableName = db.TableName,
            // A like's sort key is LIKE#<userId>, so it matches by key alone (robust to old rows that
            // lack the attribute); comments carry the author only in `userId`.
            FilterExpression = "begins_with(PK, :rating) AND (SK = :like OR (begins_with(SK, :comment) AND userId = :uid))",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":rating"] = Av.S(Keys.RatingPrefix),
                [":like"] = Av.S(Keys.LikeSk(userId)),
                [":comment"] = Av.S(Keys.CommentPrefix),
                [":uid"] = Av.S(userId),
            },
            ProjectionExpression = "PK, SK",
        };

        var removed = 0;
        do
        {
            var page = await db.Client.ScanAsync(request, ct);
            foreach (var row in page.Items)
            {
                var pk = row.StrOr(Attr.Pk, string.Empty);
                var sk = row.StrOr(Attr.Sk, string.Empty);
                var ratingId = pk[Keys.RatingPrefix.Length..];
                var counter = sk.StartsWith(Keys.LikePrefix, StringComparison.Ordinal) ? Attr.LikeCount : Attr.CommentCount;
                await ratings.RemoveReactionAsync(ratingId, sk, counter, ct);
                removed++;
            }
            request.ExclusiveStartKey = page.LastEvaluatedKey is { Count: > 0 } ? page.LastEvaluatedKey : null;
        }
        while (request.ExclusiveStartKey is not null);

        return removed;
    }

    /// <summary>
    /// Ratings other people tagged this user in: drop the user from <c>companions</c> on all three
    /// copies (everyone else stays), then the <c>TAGGED#</c> pointer. Pointer last, so a retry still
    /// knows which ratings to fix.
    /// </summary>
    private async Task<int> LeaveCompanionListsAsync(string userId, CancellationToken ct)
    {
        var tagged = await db.QueryPrefixAsync(Keys.User(userId), Keys.TaggedPrefix, ct);
        foreach (var row in tagged)
        {
            var ratingId = row.StrOr(Attr.RatingId, string.Empty);
            if (ratingId.Length > 0) await ratings.RemoveCompanionAsync(ratingId, userId, ct);
            await db.DeleteAsync(Keys.User(userId), row.StrOr(Attr.Sk, string.Empty), ct);
        }
        return tagged.Count;
    }

    /// <summary>Follows in both directions: the mirror row on the other user's partition first, then our own.</summary>
    private async Task<(int Follows, int Followers)> DeleteSocialGraphAsync(string userId, CancellationToken ct)
    {
        var follows = await db.QueryPrefixAsync(Keys.User(userId), Keys.FriendPrefix, ct);
        foreach (var row in follows)
        {
            var friendId = row.StrOr(Attr.FriendUserId, row.StrOr(Attr.Sk, string.Empty)[Keys.FriendPrefix.Length..]);
            if (friendId.Length > 0) await db.DeleteAsync(Keys.User(friendId), Keys.FollowerSk(userId), ct);
            await db.DeleteAsync(Keys.User(userId), row.StrOr(Attr.Sk, string.Empty), ct);
        }

        var followers = await db.QueryPrefixAsync(Keys.User(userId), Keys.FollowerPrefix, ct);
        foreach (var row in followers)
        {
            var followerId = row.StrOr(Attr.FollowerUserId, row.StrOr(Attr.Sk, string.Empty)[Keys.FollowerPrefix.Length..]);
            if (followerId.Length > 0) await db.DeleteAsync(Keys.User(followerId), Keys.FriendSk(userId), ct);
            await db.DeleteAsync(Keys.User(userId), row.StrOr(Attr.Sk, string.Empty), ct);
        }

        return (follows.Count, followers.Count);
    }

    private async Task DeletePrefixAsync(string userId, string prefix, CancellationToken ct)
    {
        var rows = await db.QueryPrefixAsync(Keys.User(userId), prefix, ct);
        await db.BatchDeleteAsync([.. rows.Select(KeyOf)], ct);
    }

    /// <summary>
    /// Frees the username. Conditional on the row still pointing at this user: on a retry the name
    /// may already have been taken by a new sign-up, whose lookup row must survive.
    /// </summary>
    private async Task DeleteUsernameLookupAsync(string username, string userId, CancellationToken ct)
    {
        try
        {
            await db.Client.DeleteItemAsync(new DeleteItemRequest
            {
                TableName = db.TableName,
                Key = CoffeeDb.Key(Keys.UsernameLookup(username), Keys.UsernameSk),
                ConditionExpression = "attribute_not_exists(PK) OR userId = :uid",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue> { [":uid"] = Av.S(userId) },
            }, ct);
        }
        catch (ConditionalCheckFailedException)
        {
            // Someone else owns the name now.
        }
    }

    private static Dictionary<string, AttributeValue> KeyOf(Dictionary<string, AttributeValue> item) =>
        CoffeeDb.Key(item.StrOr(Attr.Pk, string.Empty), item.StrOr(Attr.Sk, string.Empty));
}
