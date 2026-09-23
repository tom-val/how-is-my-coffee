using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Data;

namespace Coffee.Api.Features.Ratings;

/// <summary>Why a companion list was rejected — the endpoint turns this into the contract's status code.</summary>
public enum CompanionError
{
    None,
    TooMany,
    Empty,
    UserNotFound,
    CannotTagSelf,
}

/// <summary>
/// The write-side of ratings: the parts that touch several partitions at once and must stay
/// consistent between create, update and delete. Keeping them here (rather than inline in the
/// endpoints) is what stops the three paths from drifting apart, which is exactly what happened in
/// the old handlers.
/// </summary>
public sealed class RatingStore(CoffeeDb db)
{
    public const int MaxCompanions = 10;

    /// <summary>
    /// Resolves client companion input into stored companions: a <c>username</c> must exist and must
    /// not be the author; anything else is a guest carried as a display name only.
    /// </summary>
    public async Task<(List<CompanionDto> Companions, CompanionError Error, string? Detail)> ResolveCompanionsAsync(
        IReadOnlyList<CompanionInput>? input, string authorUserId, CancellationToken ct)
    {
        var resolved = new List<CompanionDto>();
        if (input is null || input.Count == 0) return (resolved, CompanionError.None, null);
        if (input.Count > MaxCompanions) return (resolved, CompanionError.TooMany, null);

        foreach (var companion in input)
        {
            var username = string.IsNullOrWhiteSpace(companion.Username) ? null : UserDirectory.Normalize(companion.Username);
            var displayName = companion.DisplayName?.Trim();

            if (username is null)
            {
                if (string.IsNullOrWhiteSpace(displayName)) return ([], CompanionError.Empty, null);
                resolved.Add(new CompanionDto(null, null, displayName));
                continue;
            }

            var userId = await db.UserIdByUsernameAsync(username, ct);
            if (userId is null) return ([], CompanionError.UserNotFound, username);
            if (userId == authorUserId) return ([], CompanionError.CannotTagSelf, username);

            var (storedUsername, storedDisplayName) = await db.IdentityAsync(userId, ct);
            resolved.Add(new CompanionDto(
                userId,
                storedUsername.Length > 0 ? storedUsername : username,
                string.IsNullOrWhiteSpace(displayName) ? storedDisplayName : displayName));
        }

        // Two chips for the same person would produce two identical TAGGED# rows.
        return ([.. resolved.DistinctBy(c => c.UserId ?? $"guest:{c.DisplayName}")], CompanionError.None, null);
    }

    /// <summary>
    /// One <c>TAGGED#</c> row per registered companion, so "Coffees with me" and the feed can find
    /// the rating by a query on that user's own partition instead of a table scan.
    /// </summary>
    public async Task WriteTaggedRowsAsync(
        IReadOnlyList<CompanionDto> companions, string ratingId, string authorUserId, string createdAt, CancellationToken ct)
    {
        foreach (var companion in companions.Where(c => c.UserId is not null))
        {
            await db.PutAsync(new Dictionary<string, AttributeValue>
            {
                [Attr.Pk] = Av.S(Keys.User(companion.UserId!)),
                [Attr.Sk] = Av.S(Keys.TaggedSk(createdAt, ratingId)),
                [Attr.RatingId] = Av.S(ratingId),
                [Attr.AuthorUserId] = Av.S(authorUserId),
                [Attr.CreatedAt] = Av.S(createdAt),
                [Attr.EntityType] = Av.S("Tagged"),
            }, ct);
        }
    }

    public async Task RemoveTaggedRowsAsync(
        IReadOnlyList<CompanionDto> companions, string ratingId, string createdAt, CancellationToken ct)
    {
        foreach (var companion in companions.Where(c => c.UserId is not null))
        {
            await db.DeleteAsync(Keys.User(companion.UserId!), Keys.TaggedSk(createdAt, ratingId), ct);
        }
    }

    /// <summary>
    /// Recomputes a place's <c>avgRating</c>/<c>ratingCount</c> from the latest rating per user, so a
    /// regular's five visits count once. Same rule the old backend used — changing it would silently
    /// restate every existing place score.
    /// </summary>
    public async Task RecomputePlaceStatsAsync(string placeId, CancellationToken ct)
    {
        var ratings = await db.QueryPrefixAsync(Keys.Place(placeId), Keys.RatingPrefix, ct, ascending: false);

        var latestByUser = new Dictionary<string, double>();
        foreach (var rating in ratings)
        {
            var userId = rating.StrOr(Attr.UserId, string.Empty);
            if (userId.Length == 0 || latestByUser.ContainsKey(userId)) continue; // descending → first wins
            latestByUser[userId] = rating.Num(Attr.Stars);
        }

        var count = latestByUser.Count;
        var average = count > 0 ? Math.Round(latestByUser.Values.Sum() / count, 1, MidpointRounding.AwayFromZero) : 0d;

        // The GSI1 keys ride along with every stats recompute: places rated on the old Node stack have
        // no index entry, so they self-heal (and become visible on the map) the next time anyone rates
        // there. Writing them here covers the create, update and delete paths in one place.
        await db.UpdateAsync(Keys.Place(placeId), Keys.MetaSk,
            "SET avgRating = :avg, ratingCount = :cnt, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk",
            new Dictionary<string, AttributeValue>
            {
                [":avg"] = Av.N(average),
                [":cnt"] = Av.N(count),
                [":gsi1pk"] = Av.S(Keys.PlaceIndexPk),
                [":gsi1sk"] = Av.S(placeId),
            }, ct);
    }

    /// <summary>Upserts the place row and the author's "places I've been" entry after a new rating.</summary>
    public async Task UpsertPlaceAsync(
        string userId, string placeId, string placeName, double lat, double lng, string? address,
        string timestamp, CancellationToken ct)
    {
        await db.UpdateAsync(Keys.User(userId), Keys.UserPlaceSk(placeId),
            "SET placeName = :placeName, lat = :lat, lng = :lng, lastVisited = :ts, entityType = :et, "
            + "placeId = :placeId, address = :addr ADD visitCount :one",
            new Dictionary<string, AttributeValue>
            {
                [":placeName"] = Av.S(placeName),
                [":lat"] = Av.N(lat),
                [":lng"] = Av.N(lng),
                [":ts"] = Av.S(timestamp),
                [":et"] = Av.S("UserPlace"),
                [":placeId"] = Av.S(placeId),
                [":addr"] = Av.S(address ?? string.Empty),
                [":one"] = Av.N(1),
            }, ct);

        await db.UpdateAsync(Keys.Place(placeId), Keys.MetaSk,
            "SET #n = :name, lat = :lat, lng = :lng, address = :addr, placeId = :pid, entityType = :et, "
            + "GSI1PK = :gsi1pk, GSI1SK = :gsi1sk",
            new Dictionary<string, AttributeValue>
            {
                [":name"] = Av.S(placeName),
                [":lat"] = Av.N(lat),
                [":lng"] = Av.N(lng),
                [":addr"] = Av.S(address ?? string.Empty),
                [":pid"] = Av.S(placeId),
                [":et"] = Av.S("Place"),
                [":gsi1pk"] = Av.S(Keys.PlaceIndexPk),
                [":gsi1sk"] = Av.S(placeId),
            }, ct, new Dictionary<string, string> { ["#n"] = Attr.Name });
    }

    public Task AdjustTotalCaffeineAsync(string userId, int delta, CancellationToken ct) =>
        delta == 0
            ? Task.CompletedTask
            : db.UpdateAsync(Keys.User(userId), Keys.ProfileSk, "ADD totalCaffeineMg :delta",
                new Dictionary<string, AttributeValue> { [":delta"] = Av.N(delta) }, ct);

    /// <summary>
    /// Tears a rating down completely: <c>RATING#&lt;id&gt;</c> (META, likes, comments), the PLACE# copy,
    /// every companion's <c>TAGGED#</c> row, the author's <c>USER#…/PLACE#</c> visit, the place stats and
    /// the author's caffeine total — and the author's USER# copy last.
    /// <para>
    /// <paramref name="rating"/> may be any of the three copies (they carry the same core fields).
    /// The account-deletion path hands in the USER# copy, which is why that one goes last: if the
    /// Lambda dies half-way, the next attempt still finds the rating on the author's partition and
    /// finishes it instead of leaving the other copies orphaned.
    /// </para>
    /// </summary>
    public async Task DeleteRatingAsync(Dictionary<string, AttributeValue> rating, CancellationToken ct)
    {
        var ratingId = rating.StrOr(Attr.RatingId, string.Empty);
        var userId = rating.StrOr(Attr.UserId, string.Empty);
        var createdAt = rating.StrOr(Attr.CreatedAt, string.Empty);
        var placeId = rating.StrOr(Attr.PlaceId, string.Empty);
        if (ratingId.Length == 0 || userId.Length == 0 || createdAt.Length == 0) return;
        var sk = Keys.RatingSk(createdAt, ratingId);

        // Everything under RATING#<id> — META plus every like and comment.
        var owned = await db.QueryPartitionAsync(Keys.Rating(ratingId), ct);
        await db.BatchDeleteAsync(
            [.. owned.Select(i => CoffeeDb.Key(i.StrOr(Attr.Pk, string.Empty), i.StrOr(Attr.Sk, string.Empty)))], ct);

        if (placeId.Length > 0) await db.DeleteAsync(Keys.Place(placeId), sk, ct);
        await RemoveTaggedRowsAsync(RatingMapper.Companions(rating), ratingId, createdAt, ct);

        if (placeId.Length > 0)
        {
            // One fewer visit to this place; drop the entry once the last rating there is gone.
            var userPlace = await db.Client.UpdateItemAsync(new UpdateItemRequest
            {
                TableName = db.TableName,
                Key = CoffeeDb.Key(Keys.User(userId), Keys.UserPlaceSk(placeId)),
                UpdateExpression = "ADD visitCount :minusOne",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue> { [":minusOne"] = Av.N(-1) },
                ReturnValues = ReturnValue.ALL_NEW,
            }, ct);
            if (userPlace.Attributes.Int(Attr.VisitCount) <= 0)
                await db.DeleteAsync(Keys.User(userId), Keys.UserPlaceSk(placeId), ct);
        }

        // The PLACE# copy is already gone, so the recompute sees the final state.
        if (placeId.Length > 0) await RecomputePlaceStatsAsync(placeId, ct);
        await AdjustTotalCaffeineAsync(userId, -rating.Int(Attr.CaffeineMg), ct);
        await db.DeleteAsync(Keys.User(userId), sk, ct);
    }

    /// <summary>
    /// Removes one like or comment row from somebody's rating and takes it off that rating's counter
    /// on all three copies, exactly once.
    /// <para>
    /// The row delete (conditional on the row still existing) and the three decrements (conditional
    /// on the copy existing and its counter being above zero) are one transaction, so a retry after a
    /// crash can neither decrement twice nor skip the decrement. If the transaction is refused because
    /// the row is already gone, there is nothing to do. If it is refused because a copy is missing or
    /// a counter already reads 0 (drift from the old stack), the row is removed on its own and each
    /// copy gets a separately guarded decrement — a counter never goes below 0 and a missing copy is
    /// never recreated as a stub.
    /// </para>
    /// </summary>
    public async Task RemoveReactionAsync(string ratingId, string reactionSk, string counterAttribute, CancellationToken ct)
    {
        var rowKey = CoffeeDb.Key(Keys.Rating(ratingId), reactionSk);
        var meta = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct,
            Attr.UserId, Attr.PlaceId, Attr.CreatedAt);
        if (meta is null)
        {
            // Orphaned reaction on a rating that no longer exists: no counters left to fix.
            await db.DeleteAsync(Keys.Rating(ratingId), reactionSk, ct);
            return;
        }

        var copies = RatingCopies(ratingId, meta);
        var names = new Dictionary<string, string> { ["#c"] = counterAttribute };
        const string Decrement = "SET #c = #c - :one";
        const string Guard = "attribute_exists(PK) AND #c > :zero";
        var values = new Dictionary<string, AttributeValue> { [":one"] = Av.N(1), [":zero"] = Av.N(0) };

        var transaction = new List<TransactWriteItem>
        {
            new()
            {
                Delete = new Delete
                {
                    TableName = db.TableName,
                    Key = rowKey,
                    ConditionExpression = "attribute_exists(PK)",
                },
            },
        };
        transaction.AddRange(copies.Select(key => new TransactWriteItem
        {
            Update = new Update
            {
                TableName = db.TableName,
                Key = key,
                UpdateExpression = Decrement,
                ConditionExpression = Guard,
                ExpressionAttributeNames = new(names),
                ExpressionAttributeValues = new(values),
            },
        }));

        try
        {
            await db.TransactWriteAsync(transaction, ct);
            return;
        }
        catch (TransactionCanceledException ex)
            when (ex.CancellationReasons is { Count: > 0 } reasons && reasons[0].Code == "ConditionalCheckFailed")
        {
            return; // The row is already gone — a previous attempt (or an unlike) handled it.
        }
        catch (TransactionCanceledException)
        {
            // Some copy is missing or already at 0: fall through to the per-copy path.
        }

        await db.DeleteAsync(Keys.Rating(ratingId), reactionSk, ct);
        foreach (var key in copies)
        {
            try
            {
                await db.Client.UpdateItemAsync(new UpdateItemRequest
                {
                    TableName = db.TableName,
                    Key = key,
                    UpdateExpression = Decrement,
                    ConditionExpression = Guard,
                    ExpressionAttributeNames = new(names),
                    ExpressionAttributeValues = new(values),
                }, ct);
            }
            catch (ConditionalCheckFailedException)
            {
                // Missing copy or counter already 0: leave it.
            }
        }
    }

    /// <summary>
    /// Takes <paramref name="userId"/> out of a rating's <c>companions</c> on all three copies. The
    /// other companions (registered or guest) are kept verbatim. Idempotent: once the user is gone
    /// from the list there is nothing to write.
    /// </summary>
    public async Task RemoveCompanionAsync(string ratingId, string userId, CancellationToken ct)
    {
        var meta = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct);
        if (meta is null) return;

        var current = meta.List(Attr.Companions);
        var remaining = RatingMapper.WithoutCompanion(current, userId);
        if (remaining.Count == current.Count) return;

        foreach (var key in RatingCopies(ratingId, meta))
        {
            try
            {
                await db.Client.UpdateItemAsync(new UpdateItemRequest
                {
                    TableName = db.TableName,
                    Key = key,
                    UpdateExpression = "SET companions = :companions",
                    ConditionExpression = "attribute_exists(PK)",
                    ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                    {
                        [":companions"] = Av.L(remaining),
                    },
                }, ct);
            }
            catch (ConditionalCheckFailedException)
            {
                // That copy does not exist; do not recreate it as a stub.
            }
        }
    }

    /// <summary>Keys of the META, USER# and PLACE# copies of a rating, read off any one of them.</summary>
    private static List<Dictionary<string, AttributeValue>> RatingCopies(
        string ratingId, Dictionary<string, AttributeValue> rating)
    {
        var sk = Keys.RatingSk(rating.StrOr(Attr.CreatedAt, string.Empty), ratingId);
        return
        [
            CoffeeDb.Key(Keys.Rating(ratingId), Keys.MetaSk),
            CoffeeDb.Key(Keys.User(rating.StrOr(Attr.UserId, string.Empty)), sk),
            CoffeeDb.Key(Keys.Place(rating.StrOr(Attr.PlaceId, string.Empty)), sk),
        ];
    }

    /// <summary>
    /// Keeps the denormalised counters in step across all three copies of a rating. A missing copy
    /// is created by <c>ADD</c> rather than failing, which matches the old behaviour.
    /// </summary>
    public async Task AdjustCountersAsync(
        string ratingId, string ownerUserId, string placeId, string createdAt,
        string attribute, int delta, CancellationToken ct)
    {
        var sk = Keys.RatingSk(createdAt, ratingId);
        var values = new Dictionary<string, AttributeValue> { [":d"] = Av.N(delta) };
        var expression = $"ADD {attribute} :d";

        await Task.WhenAll(
            db.UpdateAsync(Keys.Rating(ratingId), Keys.MetaSk, expression, new(values), ct),
            db.UpdateAsync(Keys.User(ownerUserId), sk, expression, new(values), ct),
            db.UpdateAsync(Keys.Place(placeId), sk, expression, new(values), ct));
    }
}
