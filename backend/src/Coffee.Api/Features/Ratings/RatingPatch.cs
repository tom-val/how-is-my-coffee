using System.Text.Json;
using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Data;

namespace Coffee.Api.Features.Ratings;

/// <summary>
/// The parsed <c>PUT /v1/ratings/{id}</c> body.
/// <para>
/// Read straight from a <see cref="JsonElement"/> rather than bound to a record, because the
/// contract gives <c>null</c> its own meaning: sending <c>"description": null</c> CLEARS the field,
/// while leaving it out leaves it alone. A deserialized record collapses both to <c>null</c> and
/// would silently wipe fields the client never mentioned.
/// </para>
/// </summary>
internal sealed class RatingPatch
{
    public bool HasStars { get; private set; }
    public double Stars { get; private set; }

    public bool HasDrinkName { get; private set; }
    public string? DrinkName { get; private set; }

    public bool HasDescription { get; private set; }
    public string? Description { get; private set; }

    public bool HasPhotoKey { get; private set; }
    public string? PhotoKey { get; private set; }

    public bool HasCaffeineMg { get; private set; }
    public int CaffeineMg { get; private set; }

    public bool HasPlaceName { get; private set; }
    public string? PlaceName { get; private set; }

    public bool HasLat { get; private set; }
    public double Lat { get; private set; }

    public bool HasLng { get; private set; }
    public double Lng { get; private set; }

    public bool HasAddress { get; private set; }
    public string? Address { get; private set; }

    public bool HasCompanions { get; private set; }
    public List<CompanionInput> Companions { get; } = [];

    public static RatingPatch From(JsonElement root)
    {
        var patch = new RatingPatch();
        if (root.ValueKind is not JsonValueKind.Object) return patch;

        if (root.TryGetProperty("stars", out var stars) && stars.ValueKind is JsonValueKind.Number)
        {
            patch.HasStars = true;
            patch.Stars = stars.GetDouble();
        }
        if (root.TryGetProperty("drinkName", out var drinkName) && drinkName.ValueKind is JsonValueKind.String)
        {
            patch.HasDrinkName = true;
            patch.DrinkName = drinkName.GetString()?.Trim();
        }
        if (root.TryGetProperty("description", out var description))
        {
            patch.HasDescription = true;
            patch.Description = description.ValueKind is JsonValueKind.String ? description.GetString() : null;
        }
        if (root.TryGetProperty("photoKey", out var photoKey))
        {
            patch.HasPhotoKey = true;
            patch.PhotoKey = photoKey.ValueKind is JsonValueKind.String ? photoKey.GetString() : null;
        }
        if (root.TryGetProperty("caffeineMg", out var caffeine) && caffeine.ValueKind is JsonValueKind.Number)
        {
            patch.HasCaffeineMg = true;
            patch.CaffeineMg = (int)Math.Round(caffeine.GetDouble());
        }
        if (root.TryGetProperty("placeName", out var placeName) && placeName.ValueKind is JsonValueKind.String)
        {
            patch.HasPlaceName = true;
            patch.PlaceName = placeName.GetString()?.Trim();
        }
        if (root.TryGetProperty("lat", out var lat) && lat.ValueKind is JsonValueKind.Number)
        {
            patch.HasLat = true;
            patch.Lat = lat.GetDouble();
        }
        if (root.TryGetProperty("lng", out var lng) && lng.ValueKind is JsonValueKind.Number)
        {
            patch.HasLng = true;
            patch.Lng = lng.GetDouble();
        }
        if (root.TryGetProperty("address", out var address))
        {
            patch.HasAddress = true;
            patch.Address = address.ValueKind is JsonValueKind.String ? address.GetString() : null;
        }
        if (root.TryGetProperty("companions", out var companions) && companions.ValueKind is JsonValueKind.Array)
        {
            patch.HasCompanions = true;
            foreach (var entry in companions.EnumerateArray())
            {
                if (entry.ValueKind is not JsonValueKind.Object) continue;
                var username = entry.TryGetProperty("username", out var u) && u.ValueKind is JsonValueKind.String
                    ? u.GetString() : null;
                var displayName = entry.TryGetProperty("displayName", out var d) && d.ValueKind is JsonValueKind.String
                    ? d.GetString() : null;
                patch.Companions.Add(new CompanionInput(username, displayName));
            }
        }

        return patch;
    }

    /// <summary>The first validation failure, or null when the patch is acceptable.</summary>
    public string? Validate()
    {
        if (HasStars && !RatingEndpoints.IsValidStars(Stars))
            return "stars must be between 1 and 5 in steps of 0.5";
        if (HasDrinkName && (DrinkName is null || DrinkName.Length is < 1 or > 100))
            return "drinkName must be 1-100 characters";
        if (HasDescription && Description is { Length: > 500 })
            return "description must be at most 500 characters";
        if (HasCaffeineMg && CaffeineMg is < 0 or > 1000)
            return "caffeineMg must be between 0 and 1000";
        if (HasPlaceName && (PlaceName is null || PlaceName.Length is < 1 or > 200))
            return "placeName must be 1-200 characters";
        if (HasAddress && Address is { Length: > 300 })
            return "address must be at most 300 characters";
        return null;
    }

    /// <summary>
    /// The single update expression applied to all three copies of the rating. Clearing a nullable
    /// field becomes a REMOVE, so the attribute disappears exactly as the old backend left it.
    /// </summary>
    public (string Expression, Dictionary<string, AttributeValue> Values, Dictionary<string, string>? Names)
        ToUpdateExpression(string updatedAt, IReadOnlyList<CompanionDto>? companions)
    {
        var set = new List<string> { "updatedAt = :updatedAt" };
        var remove = new List<string>();
        var values = new Dictionary<string, AttributeValue> { [":updatedAt"] = Av.S(updatedAt) };

        if (HasStars) Set(Attr.Stars, Av.N(Stars));
        if (HasDrinkName) Set(Attr.DrinkName, Av.S(DrinkName!));
        if (HasCaffeineMg) Set(Attr.CaffeineMg, Av.N(CaffeineMg));
        if (HasPlaceName) Set(Attr.PlaceName, Av.S(PlaceName!));
        if (HasLat) Set(Attr.Lat, Av.N(Lat));
        if (HasLng) Set(Attr.Lng, Av.N(Lng));
        if (HasDescription) SetOrRemove(Attr.Description, Description);
        if (HasPhotoKey) SetOrRemove(Attr.PhotoKey, PhotoKey);
        if (HasAddress) SetOrRemove(Attr.Address, Address);
        if (companions is not null) Set(Attr.Companions, RatingMapper.ToAttribute(companions));

        var clauses = new List<string>();
        if (set.Count > 0) clauses.Add($"SET {string.Join(", ", set)}");
        if (remove.Count > 0) clauses.Add($"REMOVE {string.Join(", ", remove)}");
        return (string.Join(" ", clauses), values, null);

        void Set(string attribute, AttributeValue value)
        {
            set.Add($"{attribute} = :{attribute}");
            values[$":{attribute}"] = value;
        }

        void SetOrRemove(string attribute, string? value)
        {
            if (string.IsNullOrEmpty(value)) remove.Add(attribute);
            else Set(attribute, Av.S(value));
        }
    }
}
