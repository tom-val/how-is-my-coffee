using System.Globalization;

namespace Coffee.Api.Features.Places;

/// <summary>
/// The map viewport of <c>GET /v1/places</c>, parsed from <c>?bbox=minLng,minLat,maxLng,maxLat</c>
/// (GeoJSON order — longitude first).
/// <para>
/// Parsing is strict on purpose: a box that is not four finite numbers, reaches outside ±90 / ±180,
/// or is inverted (a viewport crossing the antimeridian) is rejected with <c>invalid_bbox</c> rather
/// than quietly matching nothing, which on a map is indistinguishable from "no cafés here".
/// </para>
/// </summary>
public readonly record struct BoundingBox(double MinLng, double MinLat, double MaxLng, double MaxLat)
{
    /// <summary>What an omitted <c>?bbox=</c> means: no geographic filter at all.</summary>
    public static BoundingBox World { get; } = new(-180d, -90d, 180d, 90d);

    public static bool TryParse(string? raw, out BoundingBox box)
    {
        box = default;
        if (raw is null) return false;

        var parts = raw.Split(',');
        if (parts.Length != 4) return false;

        Span<double> values = stackalloc double[4];
        for (var i = 0; i < parts.Length; i++)
        {
            // NumberStyles.Float also accepts "NaN"/"Infinity", hence the explicit finiteness check.
            if (!double.TryParse(parts[i].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
                || !double.IsFinite(value))
            {
                return false;
            }
            values[i] = value;
        }

        var candidate = new BoundingBox(values[0], values[1], values[2], values[3]);
        if (candidate.MinLat < -90d || candidate.MaxLat > 90d) return false;
        if (candidate.MinLng < -180d || candidate.MaxLng > 180d) return false;
        if (candidate.MinLat > candidate.MaxLat || candidate.MinLng > candidate.MaxLng) return false;

        box = candidate;
        return true;
    }

    public bool Contains(double lat, double lng) =>
        lat >= MinLat && lat <= MaxLat && lng >= MinLng && lng <= MaxLng;
}
