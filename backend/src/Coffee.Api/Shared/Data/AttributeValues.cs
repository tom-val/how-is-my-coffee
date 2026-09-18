using System.Globalization;
using Amazon.DynamoDBv2.Model;

namespace Coffee.Api.Shared.Data;

/// <summary>
/// Terse constructors for low-level <see cref="AttributeValue"/> maps. Native AOT rules out the
/// reflection-based DynamoDB object persistence model, so every item is built and read by hand —
/// these keep that from drowning the feature code.
/// </summary>
public static class Av
{
    public static AttributeValue S(string value) => new() { S = value };
    public static AttributeValue N(double value) => new() { N = value.ToString("R", CultureInfo.InvariantCulture) };
    public static AttributeValue N(int value) => new() { N = value.ToString(CultureInfo.InvariantCulture) };
    public static AttributeValue L(List<AttributeValue> items) => new() { L = items, IsLSet = true };
    public static AttributeValue M(Dictionary<string, AttributeValue> map) => new() { M = map, IsMSet = true };

    /// <summary>A map entry that is simply skipped when the value is null/blank (DynamoDB rejects empty strings in keys, and the old backend dropped undefined attributes).</summary>
    public static void PutIfPresent(this Dictionary<string, AttributeValue> item, string name, string? value)
    {
        if (!string.IsNullOrEmpty(value)) item[name] = S(value);
    }
}

/// <summary>Null-safe readers for item maps; a missing attribute reads as the type's zero value.</summary>
public static class ItemReader
{
    public static string? Str(this Dictionary<string, AttributeValue> item, string name) =>
        item.TryGetValue(name, out var v) ? v.S : null;

    public static string StrOr(this Dictionary<string, AttributeValue> item, string name, string fallback) =>
        item.TryGetValue(name, out var v) && v.S is not null ? v.S : fallback;

    public static double Num(this Dictionary<string, AttributeValue> item, string name) =>
        item.TryGetValue(name, out var v) && v.N is not null
            ? double.Parse(v.N, CultureInfo.InvariantCulture)
            : 0d;

    public static int Int(this Dictionary<string, AttributeValue> item, string name) =>
        item.TryGetValue(name, out var v) && v.N is not null
            ? (int)Math.Round(double.Parse(v.N, CultureInfo.InvariantCulture))
            : 0;

    public static List<AttributeValue> List(this Dictionary<string, AttributeValue> item, string name) =>
        item.TryGetValue(name, out var v) && v.L is not null ? v.L : [];
}
