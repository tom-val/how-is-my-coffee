using System.Text.RegularExpressions;
using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Places;
using Coffee.Api.Shared.Serialization;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Places;

public sealed record PlaceDto(
    string PlaceId, string Name, double Lat, double Lng, string? Address, double AvgRating, int RatingCount);

public sealed record MapPlaceDto(
    string PlaceId, string Name, double Lat, double Lng, string? Address, double AvgRating, int RatingCount,
    int FriendCount, bool VisitedByMe, int MyVisitCount);

public sealed record MapPlaceListDto(IReadOnlyList<MapPlaceDto> Places);

// Google Places proxy. `googlePlaceId` is a round-trip handle only: the app resolves a suggestion,
// then derives its own `place_<snake_case(name)>` id, so Google's id is never stored.
public sealed record SuggestionDto(string GooglePlaceId, string Name, string Address);
public sealed record SuggestionListDto(IReadOnlyList<SuggestionDto> Suggestions);
public sealed record ResolvedPlaceDto(string Name, string Address, double Lat, double Lng);

/// <summary>
/// Cafés. A place row is created implicitly by the first rating there — there is no "add a place"
/// endpoint, and <c>avgRating</c> is maintained by <c>RatingStore.RecomputePlaceStatsAsync</c>.
/// </summary>
public static partial class PlaceEndpoints
{
    private const int DefaultMapLimit = 100;
    private const int MaxMapLimit = 300;
    private const int MinQueryLength = 2;
    private const int MaxQueryLength = 100;
    private const int MaxSuggestions = 5;

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

        // Google Places proxy — the key stays on this side. Both endpoints are listed before
        // "/v1/places/{placeId}" for readability; routing prefers the literal "suggest" segment over
        // the parameter whatever the order, and PlaceSuggestTests pins that down.
        app.MapGet("/v1/places/suggest", async (
            string? q, string? session, double? lat, double? lng,
            AuthContext auth, IGooglePlacesClient google, HttpRequest request, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            // A malformed request is the caller's bug whether or not the proxy is configured, so the
            // 400s come before the 503.
            if (!TrySessionToken(session, out var sessionToken)) return ApiResults.BadRequest("invalid_session");
            if (!AreCoordinatesValid(lat, lng)) return ApiResults.BadRequest("invalid_location");

            var input = (q ?? string.Empty).Trim();
            if (input.Length > MaxQueryLength) return ApiResults.BadRequest("invalid_query");

            if (!google.IsConfigured) return PlaceSearchUnavailable();

            // One character matches half the city — let the user keep typing rather than pay for it.
            if (input.Length < MinQueryLength)
                return Results.Json(new SuggestionListDto([]), ApiJsonSerializerContext.Default.SuggestionListDto);

            var suggestions = await google.AutocompleteAsync(
                input, sessionToken, lat, lng, PreferredLanguage(request), ct);
            if (suggestions is null) return PlaceSearchFailed();

            var dtos = suggestions
                .Take(MaxSuggestions)
                .Select(s => new SuggestionDto(s.GooglePlaceId, s.Name, s.Address))
                .ToList();
            return Results.Json(new SuggestionListDto(dtos), ApiJsonSerializerContext.Default.SuggestionListDto);
        });

        // Resolving a suggestion also closes the autocomplete session, so every keystroke that led
        // here is billed once — which is why `session` is required on this call too.
        app.MapGet("/v1/places/suggest/{googlePlaceId}", async (
            string googlePlaceId, string? session,
            AuthContext auth, IGooglePlacesClient google, HttpRequest request, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out _, out var failure)) return failure;

            if (!TrySessionToken(session, out var sessionToken)) return ApiResults.BadRequest("invalid_session");
            if (!GooglePlaceIdPattern().IsMatch(googlePlaceId)) return ApiResults.BadRequest("invalid_place_id");

            if (!google.IsConfigured) return PlaceSearchUnavailable();

            var details = await google.GetDetailsAsync(googlePlaceId, sessionToken, PreferredLanguage(request), ct);
            if (details is null) return PlaceSearchFailed();

            return Results.Json(
                new ResolvedPlaceDto(details.Name, details.Address, details.Lat, details.Lng),
                ApiJsonSerializerContext.Default.ResolvedPlaceDto);
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

    /// <summary>No key configured: the app falls back to Nominatim rather than showing an error.</summary>
    private static IResult PlaceSearchUnavailable() =>
        ApiResults.Error("place_search_unavailable", StatusCodes.Status503ServiceUnavailable);

    /// <summary>Google answered badly, timed out, or not at all.</summary>
    private static IResult PlaceSearchFailed() =>
        ApiResults.Error("place_search_failed", StatusCodes.Status502BadGateway);

    /// <summary>Google bills one autocomplete session per token, so it is required and must be the
    /// UUID the app generates when the search box opens.</summary>
    private static bool TrySessionToken(string? session, out string sessionToken)
    {
        sessionToken = session?.Trim() ?? string.Empty;
        return Guid.TryParse(sessionToken, out _);
    }

    /// <summary>Both coordinates or neither. Half a centre is a client bug, and silently dropping the
    /// 25 km bias would look like "Google is bad at this city".</summary>
    private static bool AreCoordinatesValid(double? lat, double? lng)
    {
        if (lat is null && lng is null) return true;
        if (lat is null || lng is null) return false;
        return lat is >= -90 and <= 90 && lng is >= -180 and <= 180;
    }

    /// <summary>First tag of <c>Accept-Language</c> ("lt-LT,lt;q=0.9" → "lt-LT"), passed on as
    /// <c>languageCode</c> so suggestions come back in the language the app is showing.</summary>
    private static string? PreferredLanguage(HttpRequest request)
    {
        var header = request.Headers.AcceptLanguage.ToString();
        if (string.IsNullOrWhiteSpace(header)) return null;

        var tag = header.Split(',')[0].Split(';')[0].Trim();
        return tag.Length is > 0 and <= 35 && tag != "*" ? tag : null;
    }

    /// <summary>Google's place ids are opaque; this only proves the value is safe in a URL path.</summary>
    [GeneratedRegex("^[A-Za-z0-9_-]{10,200}$")]
    private static partial Regex GooglePlaceIdPattern();

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
