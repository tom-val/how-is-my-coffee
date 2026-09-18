using System.Text.Json;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Serialization;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Ratings;

/// <summary>
/// Ratings: the write path that fans a rating out across three partitions, plus likes and comments.
/// </summary>
public static class RatingEndpoints
{
    public static IEndpointRouteBuilder MapRatingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/v1/ratings", CreateRatingAsync);
        app.MapGet("/v1/ratings/{ratingId}", GetRatingAsync);
        app.MapPut("/v1/ratings/{ratingId}", UpdateRatingAsync);
        app.MapDelete("/v1/ratings/{ratingId}", DeleteRatingAsync);
        app.MapPost("/v1/ratings/{ratingId}/like", ToggleLikeAsync);
        app.MapPost("/v1/ratings/{ratingId}/comments", CreateCommentAsync);
        return app;
    }

    private static async Task<IResult> CreateRatingAsync(
        CreateRatingBody body, AuthContext auth, CoffeeDb db, RatingStore store,
        IPhotoStorage photos, CancellationToken ct)
    {
        if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

        var placeId = (body.PlaceId ?? string.Empty).Trim();
        var placeName = (body.PlaceName ?? string.Empty).Trim();
        var drinkName = (body.DrinkName ?? string.Empty).Trim();
        var caffeineMg = body.CaffeineMg ?? 0;

        if (placeId.Length == 0) return ApiResults.BadRequest("placeId is required");
        if (placeName.Length is < 1 or > 200) return ApiResults.BadRequest("placeName must be 1-200 characters");
        if (drinkName.Length is < 1 or > 100) return ApiResults.BadRequest("drinkName must be 1-100 characters");
        if (body.Stars is not { } stars || !IsValidStars(stars))
            return ApiResults.BadRequest("stars must be between 1 and 5 in steps of 0.5");
        if (body.Lat is not { } lat || body.Lng is not { } lng)
            return ApiResults.BadRequest("lat and lng are required");
        if (body.Description is { Length: > 500 }) return ApiResults.BadRequest("description must be at most 500 characters");
        if (body.Address is { Length: > 300 }) return ApiResults.BadRequest("address must be at most 300 characters");
        if (caffeineMg is < 0 or > 1000) return ApiResults.BadRequest("caffeineMg must be between 0 and 1000");

        var (companions, companionError, detail) = await store.ResolveCompanionsAsync(body.Companions, userId, ct);
        if (companionError is not CompanionError.None) return CompanionFailure(companionError, detail);

        var (username, displayName) = await db.IdentityAsync(userId, ct);
        var ratingId = Guid.NewGuid().ToString("D");
        var createdAt = Timestamps.Now();
        var companionAttribute = RatingMapper.ToAttribute(companions);

        // Core fields shared by all three copies.
        void AddCore(Dictionary<string, AttributeValue> item)
        {
            item[Attr.RatingId] = Av.S(ratingId);
            item[Attr.UserId] = Av.S(userId);
            item[Attr.Username] = Av.S(username);
            item[Attr.PlaceId] = Av.S(placeId);
            item[Attr.PlaceName] = Av.S(placeName);
            item[Attr.Stars] = Av.N(stars);
            item[Attr.DrinkName] = Av.S(drinkName);
            item[Attr.Lat] = Av.N(lat);
            item[Attr.Lng] = Av.N(lng);
            item[Attr.CaffeineMg] = Av.N(caffeineMg);
            item[Attr.LikeCount] = Av.N(0);
            item[Attr.CommentCount] = Av.N(0);
            item[Attr.Companions] = companionAttribute;
            item[Attr.CreatedAt] = Av.S(createdAt);
            item.PutIfPresent(Attr.Description, body.Description);
            item.PutIfPresent(Attr.PhotoKey, body.PhotoKey);
            item.PutIfPresent(Attr.Address, body.Address);
        }

        var sk = Keys.RatingSk(createdAt, ratingId);
        var userCopy = new Dictionary<string, AttributeValue>
        {
            [Attr.Pk] = Av.S(Keys.User(userId)),
            [Attr.Sk] = Av.S(sk),
            [Attr.EntityType] = Av.S("Rating"),
        };
        var placeCopy = new Dictionary<string, AttributeValue>
        {
            [Attr.Pk] = Av.S(Keys.Place(placeId)),
            [Attr.Sk] = Av.S(sk),
            [Attr.EntityType] = Av.S("PlaceRating"),
        };
        var meta = new Dictionary<string, AttributeValue>
        {
            [Attr.Pk] = Av.S(Keys.Rating(ratingId)),
            [Attr.Sk] = Av.S(Keys.MetaSk),
            [Attr.EntityType] = Av.S("RatingMeta"),
        };
        AddCore(userCopy);
        AddCore(placeCopy);
        AddCore(meta);

        // The three copies are the rating; a partial write would show a card in one list and not
        // another, so they go in one transaction.
        await db.TransactWriteAsync(
            [db.PutTransact(userCopy), db.PutTransact(placeCopy), db.PutTransact(meta)], ct);

        await store.UpsertPlaceAsync(userId, placeId, placeName, lat, lng, body.Address, createdAt, ct);
        await store.RecomputePlaceStatsAsync(placeId, ct);
        await store.AdjustTotalCaffeineAsync(userId, caffeineMg, ct);
        await store.WriteTaggedRowsAsync(companions, ratingId, userId, createdAt, ct);

        return Results.Json(
            RatingMapper.ToDto(meta, photos, username, displayName),
            ApiJsonSerializerContext.Default.RatingDto,
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> GetRatingAsync(
        string ratingId, AuthContext auth, CoffeeDb db, IPhotoStorage photos, CancellationToken ct)
    {
        if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

        // META, likes and comments all live under RATING#<id>, so the whole detail view is one query.
        var items = await db.QueryPartitionAsync(Keys.Rating(ratingId), ct);

        Dictionary<string, AttributeValue>? meta = null;
        var likes = new List<LikeDto>();
        var comments = new List<CommentDto>();

        foreach (var item in items)
        {
            var sk = item.StrOr(Attr.Sk, string.Empty);
            if (sk == Keys.MetaSk)
            {
                meta = item;
            }
            else if (sk.StartsWith(Keys.LikePrefix, StringComparison.Ordinal))
            {
                likes.Add(new LikeDto(
                    item.StrOr(Attr.UserId, string.Empty),
                    item.StrOr(Attr.Username, string.Empty),
                    item.StrOr(Attr.DisplayName, string.Empty)));
            }
            else if (sk.StartsWith(Keys.CommentPrefix, StringComparison.Ordinal))
            {
                comments.Add(new CommentDto(
                    item.StrOr(Attr.CommentId, string.Empty),
                    item.StrOr(Attr.UserId, string.Empty),
                    item.StrOr(Attr.Username, string.Empty),
                    item.StrOr(Attr.DisplayName, string.Empty),
                    item.StrOr(Attr.Text, string.Empty),
                    item.StrOr(Attr.CreatedAt, string.Empty)));
            }
        }

        if (meta is null) return ApiResults.NotFound("rating_not_found");

        var hydrated = await RatingMapper.HydrateAsync(db, photos, [meta], ct);
        return Results.Json(
            new RatingDetail(hydrated[0], likes, comments, likes.Any(l => l.UserId == userId)),
            ApiJsonSerializerContext.Default.RatingDetail);
    }

    private static async Task<IResult> UpdateRatingAsync(
        string ratingId, HttpRequest request, AuthContext auth, CoffeeDb db, RatingStore store,
        IPhotoStorage photos, CancellationToken ct)
    {
        if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

        RatingPatch patch;
        try
        {
            using var document = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
            patch = RatingPatch.From(document.RootElement);
        }
        catch (JsonException)
        {
            return ApiResults.BadRequest("invalid JSON body");
        }

        if (patch.Validate() is { } validationError) return ApiResults.BadRequest(validationError);

        var meta = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct);
        if (meta is null) return ApiResults.NotFound("rating_not_found");
        if (meta.StrOr(Attr.UserId, string.Empty) != userId)
            return ApiResults.Forbidden("You can only edit your own ratings");

        var createdAt = meta.StrOr(Attr.CreatedAt, string.Empty);
        var placeId = meta.StrOr(Attr.PlaceId, string.Empty);
        var sk = Keys.RatingSk(createdAt, ratingId);
        var updatedAt = Timestamps.Now();
        var oldStars = meta.Num(Attr.Stars);
        var oldCaffeine = meta.Int(Attr.CaffeineMg);
        var oldCompanions = RatingMapper.Companions(meta);

        List<CompanionDto>? companions = null;
        if (patch.HasCompanions)
        {
            var (resolved, error, detail) = await store.ResolveCompanionsAsync(patch.Companions, userId, ct);
            if (error is not CompanionError.None) return CompanionFailure(error, detail);
            companions = resolved;
        }

        // All three copies carry the same editable fields, so one expression serves all of them.
        var (expression, values, names) = patch.ToUpdateExpression(updatedAt, companions);
        await Task.WhenAll(
            db.UpdateAsync(Keys.Rating(ratingId), Keys.MetaSk, expression, new(values), ct, names),
            db.UpdateAsync(Keys.User(userId), sk, expression, new(values), ct, names),
            db.UpdateAsync(Keys.Place(placeId), sk, expression, new(values), ct, names));

        if (patch.HasStars && Math.Abs(patch.Stars - oldStars) > double.Epsilon)
            await store.RecomputePlaceStatsAsync(placeId, ct);

        if (patch.HasCaffeineMg && patch.CaffeineMg != oldCaffeine)
            await store.AdjustTotalCaffeineAsync(userId, patch.CaffeineMg - oldCaffeine, ct);

        if (patch.HasPlaceName || patch.HasLat || patch.HasLng || patch.HasAddress)
        {
            var refreshed = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct);
            if (refreshed is not null)
            {
                await store.UpsertPlaceAsync(
                    userId, placeId,
                    refreshed.StrOr(Attr.PlaceName, string.Empty),
                    refreshed.Num(Attr.Lat), refreshed.Num(Attr.Lng),
                    refreshed.Str(Attr.Address), createdAt, ct);
                // UpsertPlace bumps visitCount, which an edit must not do.
                await db.UpdateAsync(Keys.User(userId), Keys.UserPlaceSk(placeId), "ADD visitCount :minusOne",
                    new Dictionary<string, AttributeValue> { [":minusOne"] = Av.N(-1) }, ct);
            }
        }

        if (companions is not null)
        {
            // Replacing the list means the old tags must go, or a de-tagged user keeps seeing it.
            await store.RemoveTaggedRowsAsync(oldCompanions, ratingId, createdAt, ct);
            await store.WriteTaggedRowsAsync(companions, ratingId, userId, createdAt, ct);
        }

        var updated = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct);
        var hydrated = await RatingMapper.HydrateAsync(db, photos, [updated ?? meta], ct);
        return Results.Json(hydrated[0], ApiJsonSerializerContext.Default.RatingDto);
    }

    private static async Task<IResult> DeleteRatingAsync(
        string ratingId, AuthContext auth, CoffeeDb db, RatingStore store, CancellationToken ct)
    {
        if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

        var meta = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct);
        if (meta is null) return ApiResults.NotFound("rating_not_found");
        if (meta.StrOr(Attr.UserId, string.Empty) != userId)
            return ApiResults.Forbidden("You can only delete your own ratings");

        var createdAt = meta.StrOr(Attr.CreatedAt, string.Empty);
        var placeId = meta.StrOr(Attr.PlaceId, string.Empty);
        var sk = Keys.RatingSk(createdAt, ratingId);

        // Everything under RATING#<id> — META plus every like and comment.
        var owned = await db.QueryPartitionAsync(Keys.Rating(ratingId), ct);
        await db.BatchDeleteAsync(
            [.. owned.Select(i => CoffeeDb.Key(i.StrOr(Attr.Pk, string.Empty), i.StrOr(Attr.Sk, string.Empty)))], ct);

        await db.DeleteAsync(Keys.User(userId), sk, ct);
        await db.DeleteAsync(Keys.Place(placeId), sk, ct);
        await store.RemoveTaggedRowsAsync(RatingMapper.Companions(meta), ratingId, createdAt, ct);

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

        await store.RecomputePlaceStatsAsync(placeId, ct);
        await store.AdjustTotalCaffeineAsync(userId, -meta.Int(Attr.CaffeineMg), ct);

        return ApiResults.Deleted();
    }

    private static async Task<IResult> ToggleLikeAsync(
        string ratingId, AuthContext auth, CoffeeDb db, RatingStore store, CancellationToken ct)
    {
        if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

        var meta = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct);
        if (meta is null) return ApiResults.NotFound("rating_not_found");

        var ownerUserId = meta.StrOr(Attr.UserId, string.Empty);
        var placeId = meta.StrOr(Attr.PlaceId, string.Empty);
        var createdAt = meta.StrOr(Attr.CreatedAt, string.Empty);
        var currentCount = meta.Int(Attr.LikeCount);

        var existing = await db.GetAsync(Keys.Rating(ratingId), Keys.LikeSk(userId), ct, Attr.Pk);
        if (existing is not null)
        {
            await db.DeleteAsync(Keys.Rating(ratingId), Keys.LikeSk(userId), ct);
            await store.AdjustCountersAsync(ratingId, ownerUserId, placeId, createdAt, Attr.LikeCount, -1, ct);
            return Results.Json(
                new LikeToggleDto(false, Math.Max(0, currentCount - 1)),
                ApiJsonSerializerContext.Default.LikeToggleDto);
        }

        var (username, displayName) = await db.IdentityAsync(userId, ct);
        await db.PutAsync(new Dictionary<string, AttributeValue>
        {
            [Attr.Pk] = Av.S(Keys.Rating(ratingId)),
            [Attr.Sk] = Av.S(Keys.LikeSk(userId)),
            [Attr.UserId] = Av.S(userId),
            [Attr.Username] = Av.S(username),
            [Attr.DisplayName] = Av.S(displayName),
            [Attr.CreatedAt] = Av.S(Timestamps.Now()),
            [Attr.EntityType] = Av.S("Like"),
        }, ct);
        await store.AdjustCountersAsync(ratingId, ownerUserId, placeId, createdAt, Attr.LikeCount, 1, ct);

        return Results.Json(
            new LikeToggleDto(true, currentCount + 1), ApiJsonSerializerContext.Default.LikeToggleDto);
    }

    private static async Task<IResult> CreateCommentAsync(
        string ratingId, CreateCommentBody body, AuthContext auth, CoffeeDb db, RatingStore store,
        CancellationToken ct)
    {
        if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

        var text = (body.Text ?? string.Empty).Trim();
        if (text.Length is < 1 or > 500) return ApiResults.BadRequest("text must be 1-500 characters");

        var meta = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct);
        if (meta is null) return ApiResults.NotFound("rating_not_found");

        var (username, displayName) = await db.IdentityAsync(userId, ct);
        var commentId = Guid.NewGuid().ToString("D");
        var createdAt = Timestamps.Now();

        await db.PutAsync(new Dictionary<string, AttributeValue>
        {
            [Attr.Pk] = Av.S(Keys.Rating(ratingId)),
            [Attr.Sk] = Av.S(Keys.CommentSk(createdAt, commentId)),
            [Attr.CommentId] = Av.S(commentId),
            [Attr.UserId] = Av.S(userId),
            [Attr.Username] = Av.S(username),
            [Attr.DisplayName] = Av.S(displayName),
            [Attr.Text] = Av.S(text),
            [Attr.CreatedAt] = Av.S(createdAt),
            [Attr.EntityType] = Av.S("Comment"),
        }, ct);

        await store.AdjustCountersAsync(
            ratingId, meta.StrOr(Attr.UserId, string.Empty), meta.StrOr(Attr.PlaceId, string.Empty),
            meta.StrOr(Attr.CreatedAt, string.Empty), Attr.CommentCount, 1, ct);

        return Results.Json(
            new CommentDto(commentId, userId, username, displayName, text, createdAt),
            ApiJsonSerializerContext.Default.CommentDto,
            statusCode: StatusCodes.Status201Created);
    }

    internal static bool IsValidStars(double stars) =>
        stars is >= 1 and <= 5 && Math.Abs((stars * 2) - Math.Round(stars * 2)) < 1e-9;

    private static IResult CompanionFailure(CompanionError error, string? detail) => error switch
    {
        CompanionError.TooMany => ApiResults.BadRequest($"at most {RatingStore.MaxCompanions} companions"),
        CompanionError.Empty => ApiResults.BadRequest("each companion needs a username or a displayName"),
        CompanionError.CannotTagSelf => ApiResults.BadRequest("cannot_tag_self"),
        CompanionError.UserNotFound => ApiResults.NotFound("user_not_found"),
        _ => ApiResults.BadRequest(detail ?? "invalid companions"),
    };
}
