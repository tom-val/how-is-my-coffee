using Amazon.DynamoDBv2.Model;

namespace Coffee.Api.Shared.Data;

/// <summary>
/// Username → user lookups. Usernames are stored lowercase in their own <c>USERNAME#</c> partition
/// (the uniqueness guard), so resolving a public profile is always two point reads.
/// </summary>
public static class UserDirectory
{
    /// <summary>Usernames are case-insensitive and stored lowercase; every lookup normalises first.</summary>
    public static string Normalize(string username) => username.Trim().ToLowerInvariant();

    public static async Task<string?> UserIdByUsernameAsync(this CoffeeDb db, string username, CancellationToken ct)
    {
        var item = await db.GetAsync(Keys.UsernameLookup(Normalize(username)), Keys.UsernameSk, ct, Attr.UserId);
        return item?.Str(Attr.UserId);
    }

    public static Task<Dictionary<string, AttributeValue>?> ProfileAsync(
        this CoffeeDb db, string userId, CancellationToken ct) =>
        db.GetAsync(Keys.User(userId), Keys.ProfileSk, ct);

    public static async Task<Dictionary<string, AttributeValue>?> ProfileByUsernameAsync(
        this CoffeeDb db, string username, CancellationToken ct)
    {
        var userId = await db.UserIdByUsernameAsync(username, ct);
        return userId is null ? null : await db.ProfileAsync(userId, ct);
    }

    /// <summary>The author identity denormalised onto likes, comments and friend rows.</summary>
    public static async Task<(string Username, string DisplayName)> IdentityAsync(
        this CoffeeDb db, string userId, CancellationToken ct)
    {
        var profile = await db.GetAsync(Keys.User(userId), Keys.ProfileSk, ct, Attr.Username, Attr.DisplayName);
        var username = profile?.StrOr(Attr.Username, string.Empty) ?? string.Empty;
        return (username, profile?.StrOr(Attr.DisplayName, username) ?? username);
    }
}
