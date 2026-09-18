using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Serialization;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Feed;

/// <summary>
/// The home timeline: my ratings, the ratings of everyone I follow, and the ratings I was tagged in.
/// <para>
/// There is no global secondary index ordering ratings by time across users, so the feed is a
/// scatter-gather: one bounded query per source partition, merged and sorted in memory. That is fine
/// at this app's fan-out (a personal follow list), and it keeps the write path cheap — a rating is
/// not copied into every follower's inbox. The cursor is the last item's <c>createdAt</c> used as an
/// upper bound on every partition, which is why it is a timestamp rather than a DynamoDB key.
/// </para>
/// </summary>
public static class FeedEndpoints
{
    public static IEndpointRouteBuilder MapFeedEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/v1/feed", async (
            int? limit, string? cursor,
            AuthContext auth, CoffeeDb db, IPhotoStorage photos, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var pageSize = Cursor.ParseLimit(limit?.ToString());
            var before = Cursor.DecodeTimestamp(cursor);

            var friendsTask = db.QueryPrefixAsync(Keys.User(userId), Keys.FriendPrefix, ct);
            var profileTask = db.ProfileAsync(userId, ct);
            await Task.WhenAll(friendsTask, profileTask);

            var authors = new Dictionary<string, (string Username, string DisplayName)>();
            var sources = new List<string> { userId };
            if (profileTask.Result is { } profile)
            {
                var username = profile.StrOr(Attr.Username, string.Empty);
                authors[userId] = (username, profile.StrOr(Attr.DisplayName, username));
            }
            foreach (var friend in friendsTask.Result)
            {
                var friendId = friend.StrOr(Attr.FriendUserId, string.Empty);
                if (friendId.Length == 0) continue;
                sources.Add(friendId);
                authors[friendId] = (
                    friend.StrOr(Attr.FriendUsername, string.Empty),
                    friend.StrOr(Attr.FriendDisplayName, string.Empty));
            }

            // One item beyond the page from every partition: the extra row is what tells us, after
            // the merge, whether there is a next page to hand out a cursor for.
            var fetchSize = pageSize + 1;

            // Own + followed ratings, newest first.
            var ratingQueries = sources.Distinct().Select(source =>
                db.QueryPageAsync(BuildQuery(db, Keys.User(source), Keys.RatingPrefix, before, fetchSize), ct));

            // Ratings this user was tagged in: the TAGGED# rows are pointers, resolved below.
            var taggedTask = db.QueryPageAsync(
                BuildQuery(db, Keys.User(userId), Keys.TaggedPrefix, before, fetchSize), ct);

            var ratingPages = await Task.WhenAll(ratingQueries);
            var tagged = await taggedTask;

            var items = ratingPages.SelectMany(p => p.Items).ToList();

            var taggedIds = tagged.Items
                .Select(i => i.StrOr(Attr.RatingId, string.Empty))
                .Where(id => id.Length > 0)
                .ToList();
            if (taggedIds.Count > 0)
            {
                items.AddRange(await db.BatchGetAsync(
                    [.. taggedIds.Select(id => CoffeeDb.Key(Keys.Rating(id), Keys.MetaSk))], ct));
            }

            // A rating can arrive from several sources at once (my own rating that also tagged me).
            var merged = items
                .Where(i => i.Str(Attr.RatingId) is not null)
                .GroupBy(i => i.StrOr(Attr.RatingId, string.Empty))
                .Select(g => g.First())
                .OrderByDescending(i => i.StrOr(Attr.CreatedAt, string.Empty), StringComparer.Ordinal)
                .ToList();

            var page = merged.Take(pageSize).ToList();
            var nextCursor = page.Count == pageSize && merged.Count > pageSize
                ? Cursor.EncodeTimestamp(page[^1].StrOr(Attr.CreatedAt, string.Empty))
                : null;

            var ratings = await RatingMapper.HydrateAsync(db, photos, page, ct, authors);
            var liked = await RatingMapper.LikedRatingIdsAsync(db, [.. ratings.Select(r => r.RatingId)], userId, ct);

            return Results.Json(
                new RatingPage(ratings, liked, nextCursor), ApiJsonSerializerContext.Default.RatingPage);
        });

        return app;
    }

    /// <summary>
    /// Newest-first page of one partition. With a cursor the sort key is bounded above by
    /// <c>&lt;prefix&gt;&lt;createdAt&gt;</c>, which sorts before every full key at that instant and
    /// so excludes the cursor item itself.
    /// </summary>
    private static QueryRequest BuildQuery(CoffeeDb db, string pk, string prefix, string? before, int limit)
    {
        var request = new QueryRequest
        {
            TableName = db.TableName,
            ScanIndexForward = false,
            Limit = limit,
            ExpressionAttributeValues = new Dictionary<string, AttributeValue> { [":pk"] = Av.S(pk) },
        };

        if (before is null)
        {
            request.KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)";
            request.ExpressionAttributeValues[":sk"] = Av.S(prefix);
        }
        else
        {
            request.KeyConditionExpression = "PK = :pk AND SK BETWEEN :start AND :end";
            request.ExpressionAttributeValues[":start"] = Av.S(prefix);
            request.ExpressionAttributeValues[":end"] = Av.S($"{prefix}{before}");
        }
        return request;
    }
}
