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
