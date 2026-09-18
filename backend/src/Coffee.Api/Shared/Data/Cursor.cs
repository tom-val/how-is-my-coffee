using System.Text;
using System.Text.Json;
using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Shared.Data;

/// <summary>
/// Opaque base64url pagination cursors, wire-compatible with the old Node backend's
/// <c>Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64url')</c>.
/// <para>
/// Every key attribute in this table is a string (PK/SK), so the payload round-trips through a
/// <c>Dictionary&lt;string,string&gt;</c> — a source-generated type, because Native AOT forbids the
/// reflection-based <c>JsonSerializer</c> overloads.
/// </para>
/// </summary>
public static class Cursor
{
    public const int DefaultLimit = 10;
    public const int MaxLimit = 50;

    /// <summary>Clamps <c>?limit=</c> to 1…50, defaulting to 10 — same rule as the old <c>parsePaginationParams</c>.</summary>
    public static int ParseLimit(string? raw)
    {
        if (!int.TryParse(raw, out var limit) || limit < 1) return DefaultLimit;
        return limit > MaxLimit ? MaxLimit : limit;
    }

    public static string? EncodeKey(Dictionary<string, AttributeValue>? lastEvaluatedKey)
    {
        if (lastEvaluatedKey is null || lastEvaluatedKey.Count == 0) return null;

        var flat = new Dictionary<string, string>(lastEvaluatedKey.Count);
        foreach (var (name, value) in lastEvaluatedKey)
        {
            if (value.S is not null) flat[name] = value.S;
        }
        return Encode(JsonSerializer.Serialize(flat, ApiJsonSerializerContext.Default.DictionaryStringString));
    }

    /// <summary>Decodes a cursor back into an ExclusiveStartKey. An unreadable cursor starts from the beginning, as before.</summary>
    public static Dictionary<string, AttributeValue>? DecodeKey(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return null;
        try
        {
            var flat = JsonSerializer.Deserialize(Decode(cursor), ApiJsonSerializerContext.Default.DictionaryStringString);
            if (flat is null || flat.Count == 0) return null;
            return flat.ToDictionary(e => e.Key, e => Av.S(e.Value));
        }
        catch
        {
            return null;
        }
    }

    /// <summary>The feed merges several partitions, so its cursor is the last item's <c>createdAt</c> rather than a key.</summary>
    public static string EncodeTimestamp(string createdAt) => Encode(createdAt);

    public static string? DecodeTimestamp(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return null;
        try
        {
            var value = Decode(cursor);
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
        catch
        {
            return null;
        }
    }

    private static string Encode(string value) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(value))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string Decode(string cursor)
    {
        var s = cursor.Replace('-', '+').Replace('_', '/');
        s = (s.Length % 4) switch { 2 => s + "==", 3 => s + "=", _ => s };
        return Encoding.UTF8.GetString(Convert.FromBase64String(s));
    }
}
