using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Serialization;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Places;

public sealed record PlaceDto(
    string PlaceId, string Name, double Lat, double Lng, string? Address, double AvgRating, int RatingCount);

/// <summary>
/// Cafés. A place row is created implicitly by the first rating there — there is no "add a place"
/// endpoint, and <c>avgRating</c> is maintained by <c>RatingStore.RecomputePlaceStatsAsync</c>.
/// </summary>
public static class PlaceEndpoints
{
    public static IEndpointRouteBuilder MapPlaceEndpoints(this IEndpointRouteBuilder app)
    {
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

    private static PlaceDto ToDto(Dictionary<string, AttributeValue> item) => new(
        PlaceId: item.StrOr(Attr.PlaceId, string.Empty),
        Name: item.StrOr(Attr.Name, string.Empty),
        Lat: item.Num(Attr.Lat),
        Lng: item.Num(Attr.Lng),
        Address: string.IsNullOrWhiteSpace(item.Str(Attr.Address)) ? null : item.Str(Attr.Address),
        AvgRating: item.Num(Attr.AvgRating),
        RatingCount: item.Int(Attr.RatingCount));
}
