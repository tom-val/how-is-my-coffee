using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Serialization;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Users;

/// <summary>
/// Profiles and everything hanging off one: their ratings, the places they've been, their caffeine
/// tally, the ratings they were tagged in, and username search.
/// </summary>
public static class UserEndpoints
{
    public static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/v1/me", async (AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var profile = await db.ProfileAsync(userId, ct);
            return profile is null
                ? ApiResults.NotFound("user_not_found")
                : Results.Json(UserMapper.ToDto(profile), ApiJsonSerializerContext.Default.UserDto);
        });

        // Prefix search over GSI1 for the companion picker and the add-friend screen. A literal
        // segment, so it is matched ahead of /v1/users/{username}.
        app.MapGet("/v1/users/search", async (
            string? q, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            var prefix = UserDirectory.Normalize(q ?? string.Empty);
            if (prefix.Length < 2)
                return Results.Json(new UserListDto([]), ApiJsonSerializerContext.Default.UserListDto);

            var matches = await db.QueryPageAsync(new QueryRequest
            {
                TableName = db.TableName,
                IndexName = "GSI1",
                KeyConditionExpression = "GSI1PK = :pk AND begins_with(GSI1SK, :prefix)",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    [":pk"] = Av.S(Keys.UsernameIndexPk),
                    [":prefix"] = Av.S(prefix),
                },
                Limit = 10,
            }, ct);

            var userIds = matches.Items
                .Select(i => i.Str(Attr.UserId))
                .Where(id => !string.IsNullOrEmpty(id))
                .Distinct()
                .ToList();
            if (userIds.Count == 0)
                return Results.Json(new UserListDto([]), ApiJsonSerializerContext.Default.UserListDto);

            var profiles = await db.BatchGetAsync(
                [.. userIds.Select(id => CoffeeDb.Key(Keys.User(id!), Keys.ProfileSk))],
                ct, Attr.UserId, Attr.Username, Attr.DisplayName, Attr.CreatedAt);

            var users = profiles
                .Select(UserMapper.ToDto)
                .OrderBy(u => u.Username, StringComparer.Ordinal)
                .ToList();
            return Results.Json(new UserListDto(users), ApiJsonSerializerContext.Default.UserListDto);
        });

        // Public profile — the one screen an unauthenticated visitor can open (/u/<username>).
        app.MapGet("/v1/users/{username}", async (string username, CoffeeDb db, CancellationToken ct) =>
        {
            var profile = await db.ProfileByUsernameAsync(username, ct);
            return profile is null
                ? ApiResults.NotFound("user_not_found")
                : Results.Json(UserMapper.ToDto(profile), ApiJsonSerializerContext.Default.UserDto);
        });

        // Public, but a token is still honoured so the caller's own likes come back highlighted.
        app.MapGet("/v1/users/{username}/ratings", async (
            string username, int? limit, string? cursor,
            AuthContext auth, CoffeeDb db, IPhotoStorage photos, CancellationToken ct) =>
        {
            var profile = await db.ProfileByUsernameAsync(username, ct);
            if (profile is null) return ApiResults.NotFound("user_not_found");

            var userId = profile.StrOr(Attr.UserId, string.Empty);
            var page = await db.QueryPageAsync(new QueryRequest
            {
                TableName = db.TableName,
                KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    [":pk"] = Av.S(Keys.User(userId)),
                    [":sk"] = Av.S(Keys.RatingPrefix),
                },
                ScanIndexForward = false,
                Limit = Cursor.ParseLimit(limit?.ToString()),
                ExclusiveStartKey = Cursor.DecodeKey(cursor),
            }, ct);

            var author = profile.StrOr(Attr.Username, username);
            var known = new Dictionary<string, (string, string)>
            {
                [userId] = (author, profile.StrOr(Attr.DisplayName, author)),
            };
            var ratings = await RatingMapper.HydrateAsync(db, photos, page.Items, ct, known);
            var liked = await RatingMapper.LikedRatingIdsAsync(db, [.. ratings.Select(r => r.RatingId)], auth.UserId, ct);

            return Results.Json(
                new RatingPage(ratings, liked, Cursor.EncodeKey(page.LastEvaluatedKey)),
                ApiJsonSerializerContext.Default.RatingPage);
        });

        app.MapGet("/v1/users/{username}/places", async (
            string username, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            var userId = await db.UserIdByUsernameAsync(username, ct);
            if (userId is null) return ApiResults.NotFound("user_not_found");

            var items = await db.QueryPrefixAsync(Keys.User(userId), Keys.PlacePrefix, ct);
            var places = items.Select(item => new UserPlaceDto(
                PlaceId: item.StrOr(Attr.PlaceId, string.Empty),
                PlaceName: item.StrOr(Attr.PlaceName, string.Empty),
                Lat: item.Num(Attr.Lat),
                Lng: item.Num(Attr.Lng),
                Address: string.IsNullOrWhiteSpace(item.Str(Attr.Address)) ? null : item.Str(Attr.Address),
                LastVisited: item.Str(Attr.LastVisited),
                VisitCount: item.Int(Attr.VisitCount))).ToList();

            return Results.Json(new UserPlaceListDto(places), ApiJsonSerializerContext.Default.UserPlaceListDto);
        });

        app.MapGet("/v1/users/{username}/caffeine", async (
            string username, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            var profile = await db.ProfileByUsernameAsync(username, ct);
            if (profile is null) return ApiResults.NotFound("user_not_found");

            var userId = profile.StrOr(Attr.UserId, string.Empty);
            // Sort keys embed the ISO timestamp, so "today" is a plain range scan — no filter needed.
            var today = Timestamps.TodayPrefix();
            var todays = await db.QueryAllAsync(new QueryRequest
            {
                TableName = db.TableName,
                KeyConditionExpression = "PK = :pk AND SK BETWEEN :start AND :end",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    [":pk"] = Av.S(Keys.User(userId)),
                    [":start"] = Av.S($"{Keys.RatingPrefix}{today}"),
                    [":end"] = Av.S($"{Keys.RatingPrefix}{today}￿"),
                },
            }, ct);

            var todayMg = todays.Sum(r => r.Int(Attr.CaffeineMg));
            return Results.Json(
                new CaffeineStatsDto(todayMg, profile.Int(Attr.TotalCaffeineMg)),
                ApiJsonSerializerContext.Default.CaffeineStatsDto);
        });

        // "Coffees with me" — the ratings somebody else tagged this user in. The TAGGED# rows are
        // only pointers, so the ratings themselves are fetched from their META copies.
        app.MapGet("/v1/users/{username}/tagged", async (
            string username, int? limit, string? cursor,
            AuthContext auth, CoffeeDb db, IPhotoStorage photos, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            var userId = await db.UserIdByUsernameAsync(username, ct);
            if (userId is null) return ApiResults.NotFound("user_not_found");

            var page = await db.QueryPageAsync(new QueryRequest
            {
                TableName = db.TableName,
                KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    [":pk"] = Av.S(Keys.User(userId)),
                    [":sk"] = Av.S(Keys.TaggedPrefix),
                },
                ScanIndexForward = false,
                Limit = Cursor.ParseLimit(limit?.ToString()),
                ExclusiveStartKey = Cursor.DecodeKey(cursor),
            }, ct);

            var ratingIds = page.Items
                .Select(i => i.StrOr(Attr.RatingId, string.Empty))
                .Where(id => id.Length > 0)
                .ToList();

            var metas = ratingIds.Count == 0
                ? []
                : await db.BatchGetAsync([.. ratingIds.Select(id => CoffeeDb.Key(Keys.Rating(id), Keys.MetaSk))], ct);

            // BatchGet does not preserve order; restore the newest-first order of the TAGGED# rows.
            var byId = metas.ToDictionary(m => m.StrOr(Attr.RatingId, string.Empty));
            var ordered = ratingIds.Where(byId.ContainsKey).Select(id => byId[id]).ToList();

            var ratings = await RatingMapper.HydrateAsync(db, photos, ordered, ct);
            var liked = await RatingMapper.LikedRatingIdsAsync(db, [.. ratings.Select(r => r.RatingId)], auth.UserId, ct);

            return Results.Json(
                new RatingPage(ratings, liked, Cursor.EncodeKey(page.LastEvaluatedKey)),
                ApiJsonSerializerContext.Default.RatingPage);
        });

        return app;
    }
}
