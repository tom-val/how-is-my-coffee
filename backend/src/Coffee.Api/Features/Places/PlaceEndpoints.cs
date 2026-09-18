using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Serialization;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Places;

public sealed record PlaceDto(
    string PlaceId, string Name, double Lat, double Lng, string? Address, double AvgRating, int RatingCount);

public sealed record MapPlaceDto(
    string PlaceId, string Name, double Lat, double Lng, string? Address, double AvgRating, int RatingCount,
    int FriendCount, bool VisitedByMe, int MyVisitCount);

public sealed record MapPlaceListDto(IReadOnlyList<MapPlaceDto> Places);

/// <summary>
/// Cafés. A place row is created implicitly by the first rating there — there is no "add a place"
/// endpoint, and <c>avgRating</c> is maintained by <c>RatingStore.RecomputePlaceStatsAsync</c>.
/// </summary>
public static class PlaceEndpoints
{
    private const int DefaultMapLimit = 100;
    private const int MaxMapLimit = 300;

    public static IEndpointRouteBuilder MapPlaceEndpoints(this IEndpointRouteBuilder app)
    {
        // Map / discovery. Registered before /v1/places/{placeId}; the literal route has no
        // conflicting segment, so ordering is cosmetic.
        app.MapGet("/v1/places", async (
            string? bbox, bool? friends, int? limit,
            AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            // No ?bbox= means "the whole world" (a list view with no viewport); a *malformed* one is an
            // error rather than an empty map, which would look like "there are no cafés here".
            var box = BoundingBox.World;
            if (!string.IsNullOrWhiteSpace(bbox) && !BoundingBox.TryParse(bbox, out box))
                return ApiResults.BadRequest("invalid_bbox");

            // One GSI1 partition holds every place anyone has rated. It is small (cafés, not ratings),
            // so it is read to the end and the viewport is applied in memory — no scan, no geo index.
            var places = await db.QueryAllAsync(new QueryRequest
            {
                TableName = db.TableName,
                IndexName = "GSI1",
                KeyConditionExpression = "GSI1PK = :pk",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    [":pk"] = Av.S(Keys.PlaceIndexPk),
                },
            }, ct);

            var inBox = places
                .Where(p => p.ContainsKey(Attr.Lat) && p.ContainsKey(Attr.Lng))
                .Where(p => box.Contains(p.Num(Attr.Lat), p.Num(Attr.Lng)))
                .ToList();

            if (inBox.Count == 0)
                return Results.Json(new MapPlaceListDto([]), ApiJsonSerializerContext.Default.MapPlaceListDto);

            // "Who I follow has been here" and "I have been here" are both single-partition queries per
            // user, so the whole social overlay is one round of parallel PLACE# reads.
            var friendCounts = await FriendVisitCountsAsync(db, userId, ct);
            var myVisits = await MyVisitsAsync(db, userId, ct);

            var results = inBox
                .Select(item => ToMapDto(item, friendCounts, myVisits))
                .Where(p => p.PlaceId.Length > 0)
                .Where(p => friends != true || p.FriendCount > 0 || p.VisitedByMe)
                .OrderByDescending(p => p.RatingCount)
                .ThenByDescending(p => p.AvgRating)
                .ThenBy(p => p.PlaceId, StringComparer.Ordinal)
                .Take(ParseMapLimit(limit))
                .ToList();

            return Results.Json(new MapPlaceListDto(results), ApiJsonSerializerContext.Default.MapPlaceListDto);
        });

        app.MapGet("/v1/places/{placeId}", async (
            string placeId, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            var item = await db.GetAsync(Keys.Place(placeId), Keys.MetaSk, ct);
            return item is null
                ? ApiResults.NotFound("place_not_found")
                : Results.Json(ToDto(item), ApiJsonSerializerContext.Default.PlaceDto);
        });

        app.MapGet("/v1/places/{placeId}/ratings", async (
            string placeId, int? limit, string? cursor,
            AuthContext auth, CoffeeDb db, IPhotoStorage photos, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            var page = await db.QueryPageAsync(new QueryRequest
            {
                TableName = db.TableName,
                KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    [":pk"] = Av.S(Keys.Place(placeId)),
                    [":sk"] = Av.S(Keys.RatingPrefix),
                },
                ScanIndexForward = false,
                Limit = Cursor.ParseLimit(limit?.ToString()),
                ExclusiveStartKey = Cursor.DecodeKey(cursor),
            }, ct);

            // Rating copies on a PLACE# partition carry no place fields (they are implied by the
            // partition), so the place row supplies them.
            var meta = await db.GetAsync(Keys.Place(placeId), Keys.MetaSk, ct);
            var fallback = meta is null
                ? null
                : new PlaceFallback(placeId, meta.StrOr(Attr.Name, string.Empty),
                    meta.Num(Attr.Lat), meta.Num(Attr.Lng), meta.Str(Attr.Address));

            var ratings = await RatingMapper.HydrateAsync(db, photos, page.Items, ct, place: fallback);
            var liked = await RatingMapper.LikedRatingIdsAsync(db, [.. ratings.Select(r => r.RatingId)], auth.UserId, ct);

            return Results.Json(
                new RatingPage(ratings, liked, Cursor.EncodeKey(page.LastEvaluatedKey)),
                ApiJsonSerializerContext.Default.RatingPage);
        });

        return app;
    }

    /// <summary>Clamps <c>?limit=</c> to 1…300, defaulting to 100 — the map's own budget, not the feed's.</summary>
    private static int ParseMapLimit(int? limit) =>
        limit is null or < 1 ? DefaultMapLimit : Math.Min(limit.Value, MaxMapLimit);

    private static MapPlaceDto ToMapDto(
        Dictionary<string, AttributeValue> item,
        IReadOnlyDictionary<string, int> friendCounts,
        IReadOnlyDictionary<string, int> myVisits)
    {
        // Rows written before `placeId` was denormalised onto the place row fall back to the index key.
        var placeId = item.StrOr(Attr.PlaceId, string.Empty);
        if (placeId.Length == 0) placeId = item.StrOr(Attr.Gsi1Sk, string.Empty);

        var address = item.Str(Attr.Address);
        return new MapPlaceDto(
            PlaceId: placeId,
            Name: item.StrOr(Attr.Name, string.Empty),
            Lat: item.Num(Attr.Lat),
            Lng: item.Num(Attr.Lng),
            Address: string.IsNullOrWhiteSpace(address) ? null : address,
            AvgRating: item.Num(Attr.AvgRating),
            RatingCount: item.Int(Attr.RatingCount),
            FriendCount: friendCounts.GetValueOrDefault(placeId),
            VisitedByMe: myVisits.ContainsKey(placeId),
            MyVisitCount: myVisits.GetValueOrDefault(placeId));
    }

    /// <summary>
    /// How many of the people I follow have rated each place. One query per followed user (they run in
    /// parallel), keys and <c>placeId</c> only — the friend lists are small and the alternative would
    /// be a scan of every rating in the table.
    /// </summary>
    private static async Task<Dictionary<string, int>> FriendVisitCountsAsync(
        CoffeeDb db, string userId, CancellationToken ct)
    {
        var friendRows = await db.QueryPrefixAsync(Keys.User(userId), Keys.FriendPrefix, ct);
        var friendIds = friendRows
            .Select(f => f.StrOr(Attr.FriendUserId, string.Empty))
            .Where(id => id.Length > 0 && id != userId)
            .Distinct()
            .ToList();

        var counts = new Dictionary<string, int>();
        if (friendIds.Count == 0) return counts;

        var visited = await Task.WhenAll(friendIds.Select(id => VisitedPlaceIdsAsync(db, id, ct)));
        foreach (var placeId in visited.SelectMany(ids => ids))
        {
            counts[placeId] = counts.GetValueOrDefault(placeId) + 1;
        }
        return counts;
    }

    private static async Task<HashSet<string>> VisitedPlaceIdsAsync(CoffeeDb db, string userId, CancellationToken ct)
    {
        var rows = await db.QueryAllAsync(UserPlacesQuery(db, userId, Attr.PlaceId), ct);
        return [.. rows.Select(r => r.StrOr(Attr.PlaceId, string.Empty)).Where(id => id.Length > 0)];
    }

    /// <summary>My own <c>PLACE#</c> rows — the source of <c>visitedByMe</c> and <c>myVisitCount</c>.</summary>
    private static async Task<Dictionary<string, int>> MyVisitsAsync(CoffeeDb db, string userId, CancellationToken ct)
    {
        var rows = await db.QueryAllAsync(UserPlacesQuery(db, userId, Attr.PlaceId, Attr.VisitCount), ct);

        var visits = new Dictionary<string, int>();
        foreach (var row in rows)
        {
            var placeId = row.StrOr(Attr.PlaceId, string.Empty);
            if (placeId.Length == 0) continue;
            visits[placeId] = Math.Max(row.Int(Attr.VisitCount), 0);
        }
        return visits;
    }

    /// <summary>The <c>PLACE#</c> rows of one user's partition, projected down to the given attributes
    /// (aliased, so no attribute name can collide with a DynamoDB reserved word).</summary>
    private static QueryRequest UserPlacesQuery(CoffeeDb db, string userId, params string[] projection) => new()
    {
        TableName = db.TableName,
        KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues = new Dictionary<string, AttributeValue>
        {
            [":pk"] = Av.S(Keys.User(userId)),
            [":sk"] = Av.S(Keys.PlacePrefix),
        },
        ProjectionExpression = string.Join(", ", projection.Select((_, i) => $"#p{i}")),
        ExpressionAttributeNames = projection
            .Select((name, i) => (Alias: $"#p{i}", Name: name))
            .ToDictionary(e => e.Alias, e => e.Name),
    };

    private static PlaceDto ToDto(Dictionary<string, AttributeValue> item) => new(
        PlaceId: item.StrOr(Attr.PlaceId, string.Empty),
        Name: item.StrOr(Attr.Name, string.Empty),
        Lat: item.Num(Attr.Lat),
        Lng: item.Num(Attr.Lng),
        Address: string.IsNullOrWhiteSpace(item.Str(Attr.Address)) ? null : item.Str(Attr.Address),
        AvgRating: item.Num(Attr.AvgRating),
        RatingCount: item.Int(Attr.RatingCount));
}
