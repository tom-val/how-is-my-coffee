using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Ratings;

/// <summary>
/// Turns stored rating items into <see cref="RatingDto"/>s.
/// <para>
/// A rating exists as three denormalised copies (USER#, PLACE#, RATING#…META) and they do not all
/// carry the same attributes — the PLACE# copy has no place fields (it is implied by its partition)
/// and none of them stores the author's <c>displayName</c>. Everything a list endpoint returns
/// therefore goes through <see cref="HydrateAsync"/>, which fills the author identity from the
/// profile rows in a single BatchGet instead of one read per rating.
/// </para>
/// </summary>
public static class RatingMapper
{
    /// <summary>Reads the <c>companions</c> list; rows written before the feature existed simply have none.</summary>
    public static List<CompanionDto> Companions(Dictionary<string, AttributeValue> item)
    {
        var raw = item.List(Attr.Companions);
        var companions = new List<CompanionDto>(raw.Count);
        foreach (var entry in raw)
        {
            if (entry.M is not { Count: > 0 } map) continue;
            var displayName = map.Str(Attr.DisplayName);
            if (string.IsNullOrWhiteSpace(displayName)) continue;
            companions.Add(new CompanionDto(map.Str(Attr.UserId), map.Str(Attr.Username), displayName));
        }
        return companions;
    }

    /// <summary>
    /// The stored <c>companions</c> list minus every entry for <paramref name="userId"/>. Works on the
    /// raw attribute values so the entries that stay are written back exactly as they were (including
    /// anything the old stack stored that <see cref="Companions"/> would not round-trip).
    /// </summary>
    public static List<AttributeValue> WithoutCompanion(IReadOnlyList<AttributeValue> stored, string userId) =>
        [.. stored.Where(entry => entry.M is not { } map || map.Str(Attr.UserId) != userId)];

    public static AttributeValue ToAttribute(IReadOnlyList<CompanionDto> companions)
    {
        var list = new List<AttributeValue>(companions.Count);
        foreach (var companion in companions)
        {
            var map = new Dictionary<string, AttributeValue> { [Attr.DisplayName] = Av.S(companion.DisplayName) };
            map.PutIfPresent(Attr.UserId, companion.UserId);
            map.PutIfPresent(Attr.Username, companion.Username);
            list.Add(Av.M(map));
        }
        return Av.L(list);
    }

    /// <summary>
    /// Maps one stored item. <paramref name="place"/> supplies the place fields for PLACE# copies,
    /// which do not store them.
    /// </summary>
    public static RatingDto ToDto(
        Dictionary<string, AttributeValue> item,
        IPhotoStorage photos,
        string username,
        string displayName,
        PlaceFallback? place = null)
    {
        var photoKey = item.Str(Attr.PhotoKey);
        return new RatingDto(
            RatingId: item.StrOr(Attr.RatingId, string.Empty),
            UserId: item.StrOr(Attr.UserId, string.Empty),
            Username: username,
            DisplayName: displayName,
            PlaceId: item.Str(Attr.PlaceId) ?? place?.PlaceId ?? string.Empty,
            PlaceName: item.Str(Attr.PlaceName) ?? place?.PlaceName ?? string.Empty,
            Address: NullIfBlank(item.Str(Attr.Address) ?? place?.Address),
            Lat: item.ContainsKey(Attr.Lat) ? item.Num(Attr.Lat) : place?.Lat ?? 0d,
            Lng: item.ContainsKey(Attr.Lng) ? item.Num(Attr.Lng) : place?.Lng ?? 0d,
            Stars: item.Num(Attr.Stars),
            DrinkName: item.StrOr(Attr.DrinkName, string.Empty),
            Description: NullIfBlank(item.Str(Attr.Description)),
            PhotoKey: NullIfBlank(photoKey),
            PhotoUrl: photos.PhotoUrl(photoKey),
            CaffeineMg: item.Int(Attr.CaffeineMg),
            LikeCount: item.Int(Attr.LikeCount),
            CommentCount: item.Int(Attr.CommentCount),
            Companions: Companions(item),
            CreatedAt: item.StrOr(Attr.CreatedAt, string.Empty),
            UpdatedAt: NullIfBlank(item.Str(Attr.UpdatedAt)));
    }

    /// <summary>
    /// Maps a batch of stored rating items, resolving each author's username/displayName from their
    /// profile in one BatchGet. <paramref name="known"/> short-circuits authors the caller already
    /// knows (the profile page, the feed's friend list).
    /// </summary>
    public static async Task<List<RatingDto>> HydrateAsync(
        CoffeeDb db,
        IPhotoStorage photos,
        IReadOnlyList<Dictionary<string, AttributeValue>> items,
        CancellationToken ct,
        IReadOnlyDictionary<string, (string Username, string DisplayName)>? known = null,
        PlaceFallback? place = null)
    {
        if (items.Count == 0) return [];

        var authors = new Dictionary<string, (string Username, string DisplayName)>(
            known ?? new Dictionary<string, (string, string)>());

        var missing = items
            .Select(i => i.StrOr(Attr.UserId, string.Empty))
            .Where(id => id.Length > 0 && !authors.ContainsKey(id))
            .Distinct()
            .ToList();

        if (missing.Count > 0)
        {
            var profiles = await db.BatchGetAsync(
                [.. missing.Select(id => CoffeeDb.Key(Keys.User(id), Keys.ProfileSk))],
                ct, Attr.UserId, Attr.Username, Attr.DisplayName);

            foreach (var profile in profiles)
            {
                var id = profile.Str(Attr.UserId);
                if (id is null) continue;
                var username = profile.StrOr(Attr.Username, string.Empty);
                authors[id] = (username, profile.StrOr(Attr.DisplayName, username));
            }
        }

        var dtos = new List<RatingDto>(items.Count);
        foreach (var item in items)
        {
            var userId = item.StrOr(Attr.UserId, string.Empty);
            // A deleted author still has ratings on place partitions; fall back to whatever the copy carries.
            var fallbackUsername = item.StrOr(Attr.Username, string.Empty);
            var (username, displayName) = authors.TryGetValue(userId, out var author)
                ? author
                : (fallbackUsername, fallbackUsername);
            dtos.Add(ToDto(item, photos, username, displayName, place));
        }
        return dtos;
    }

    /// <summary>Which of these ratings the given user has liked (empty for anonymous callers).</summary>
    public static async Task<List<string>> LikedRatingIdsAsync(
        CoffeeDb db, IReadOnlyList<string> ratingIds, string? userId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(userId) || ratingIds.Count == 0) return [];

        var keys = ratingIds
            .Distinct()
            .Select(id => CoffeeDb.Key(Keys.Rating(id), Keys.LikeSk(userId)))
            .ToList();

        var likes = await db.BatchGetAsync(keys, ct, Attr.Pk);
        return [.. likes
            .Select(l => l.StrOr(Attr.Pk, string.Empty))
            .Where(pk => pk.StartsWith(Keys.RatingPrefix, StringComparison.Ordinal))
            .Select(pk => pk[Keys.RatingPrefix.Length..])];
    }

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}

/// <summary>Place fields for rating copies stored on a PLACE# partition, which omit them.</summary>
public sealed record PlaceFallback(string PlaceId, string PlaceName, double Lat, double Lng, string? Address);
