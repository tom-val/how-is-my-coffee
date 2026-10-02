using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Data;

namespace Coffee.Api.Shared.Moderation;

/// <summary>
/// Everyone hidden from one user: the people they blocked and the people who blocked them. A block
/// works both ways (see "Safety" in the contract), so for every read and write path the question is
/// simply "is this user id in the set?".
/// <para>
/// Loaded once per request with a single key-only query — <c>USER#&lt;me&gt;</c>,
/// <c>begins_with(SK, "BLOCK")</c> matches both <c>BLOCK#</c> and <c>BLOCKEDBY#</c> rows, because the
/// block writes a mirror row on the other user's partition. Anonymous callers get
/// <see cref="Empty"/> without touching DynamoDB, which is what keeps the public profile and its
/// rating list exactly as they were.
/// </para>
/// </summary>
public sealed class BlockList
{
    public static readonly BlockList Empty = new([]);

    private readonly HashSet<string> _hidden;

    private BlockList(HashSet<string> hidden) => _hidden = hidden;

    public bool IsEmpty => _hidden.Count == 0;

    /// <summary>True when <paramref name="userId"/> blocked the caller or was blocked by them.</summary>
    public bool Hides(string? userId) => !string.IsNullOrEmpty(userId) && _hidden.Contains(userId);

    public static async Task<BlockList> LoadAsync(CoffeeDb db, string? userId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(userId)) return Empty;

        var rows = await db.QueryAllAsync(new QueryRequest
        {
            TableName = db.TableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = Av.S(Keys.User(userId)),
                [":sk"] = Av.S(Keys.BlockFamilyPrefix),
            },
            ProjectionExpression = Attr.Sk,
        }, ct);

        var hidden = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            if (OtherUserId(row.StrOr(Attr.Sk, string.Empty)) is { } other) hidden.Add(other);
        }
        return hidden.Count == 0 ? Empty : new BlockList(hidden);
    }

    /// <summary>The other user's id from a <c>BLOCK#</c> / <c>BLOCKEDBY#</c> sort key (null for anything else).</summary>
    public static string? OtherUserId(string sk)
    {
        // BLOCKEDBY# first: "BLOCKEDBY#…" does not start with "BLOCK#", but be explicit anyway.
        if (sk.StartsWith(Keys.BlockedByPrefix, StringComparison.Ordinal))
            return NullIfEmpty(sk[Keys.BlockedByPrefix.Length..]);
        if (sk.StartsWith(Keys.BlockPrefix, StringComparison.Ordinal))
            return NullIfEmpty(sk[Keys.BlockPrefix.Length..]);
        return null;
    }

    private static string? NullIfEmpty(string value) => value.Length == 0 ? null : value;
}
