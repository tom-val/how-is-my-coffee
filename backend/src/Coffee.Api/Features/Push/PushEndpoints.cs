using System.Text.RegularExpressions;
using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Push;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Features.Push;

/// <summary>What the app sends after <c>getExpoPushTokenAsync()</c>.</summary>
public sealed record RegisterPushTokenBody(string? Token, string? Platform);

/// <summary>The five switches on the Settings screen. Every one defaults to on.</summary>
public sealed record NotificationPrefsDto(bool Tagged, bool Like, bool Comment, bool Follow, bool FriendRating);

/// <summary>
/// The <c>PUT</c> body: a <i>subset</i> of the five. Nullable on purpose — the app sends only the
/// switch the user just flipped, and an absent key must keep its stored value rather than reset it.
/// </summary>
public sealed record NotificationPrefsPatch(bool? Tagged, bool? Like, bool? Comment, bool? Follow, bool? FriendRating);

/// <summary>
/// Device registration and notification preferences. Tokens live as
/// <c>PK=USER#&lt;userId&gt; SK=PUSH#&lt;token&gt;</c> — one row per device, the token as the sort key, so
/// registering the same device twice is an upsert and signing out deletes exactly one row.
/// </summary>
public static partial class PushEndpoints
{
    private static readonly string[] Platforms = ["ios", "android"];

    /// <summary>
    /// The two shapes Expo hands out (<c>ExponentPushToken[…]</c> historically, <c>ExpoPushToken[…]</c>
    /// on newer SDKs). Validating here keeps junk out of the table — an unusable token would
    /// otherwise sit there collecting a rejected ticket on every send.
    /// </summary>
    [GeneratedRegex(@"^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$", RegexOptions.CultureInvariant)]
    private static partial Regex ExpoTokenPattern();

    public static IEndpointRouteBuilder MapPushEndpoints(this IEndpointRouteBuilder app)
    {
        // Upsert this device's token. Idempotent: `createdAt` is preserved with if_not_exists so a
        // re-register (every cold start of the app) only moves `lastSeenAt`.
        app.MapPut("/v1/push/tokens", async (
            RegisterPushTokenBody body, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var token = (body.Token ?? string.Empty).Trim();
            if (!ExpoTokenPattern().IsMatch(token)) return ApiResults.BadRequest("invalid_token");

            var platform = (body.Platform ?? string.Empty).Trim().ToLowerInvariant();
            if (!Platforms.Contains(platform)) return ApiResults.BadRequest("invalid_platform");

            var now = Timestamps.Now();
            await db.UpdateAsync(Keys.User(userId), Keys.PushSk(token),
                "SET #token = :token, #platform = :platform, lastSeenAt = :now, entityType = :et, "
                + "createdAt = if_not_exists(createdAt, :now)",
                new Dictionary<string, AttributeValue>
                {
                    [":token"] = Av.S(token),
                    [":platform"] = Av.S(platform),
                    [":now"] = Av.S(now),
                    [":et"] = Av.S("PushToken"),
                }, ct, new Dictionary<string, string>
                {
                    // `token` and `platform` are both DynamoDB reserved words.
                    ["#token"] = Attr.Token,
                    ["#platform"] = Attr.Platform,
                });

            return Results.Json(new StatusResponse("ok"), ApiJsonSerializerContext.Default.StatusResponse);
        });

        // Sign-out. Idempotent, and deliberately unvalidated: whatever the device has, drop it — the
        // next person to sign in on this phone must not inherit the previous user's notifications.
        app.MapDelete("/v1/push/tokens/{token}", async (
            string token, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            await db.DeleteAsync(Keys.User(userId), Keys.PushSk(token.Trim()), ct);
            return ApiResults.Deleted();
        });

        app.MapGet("/v1/notification-prefs", async (AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            // The projection carries userId as well: an item that has none of the projected
            // attributes comes back as "not found", and a profile that never saved prefs has none.
            var profile = await db.GetAsync(Keys.User(userId), Keys.ProfileSk, ct, Attr.UserId, Attr.NotificationPrefs);
            return Results.Json(ToDto(NotificationPrefs.Read(profile)), ApiJsonSerializerContext.Default.NotificationPrefsDto);
        });

        // Merge, don't replace: read what is stored (defaults applied), overlay the keys the body
        // actually carried, write the whole map back. Unknown keys are dropped by deserialization.
        app.MapPut("/v1/notification-prefs", async (
            NotificationPrefsPatch body, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var profile = await db.GetAsync(Keys.User(userId), Keys.ProfileSk, ct, Attr.UserId, Attr.NotificationPrefs);
            if (profile is null) return ApiResults.NotFound("user_not_found");

            var prefs = NotificationPrefs.Read(profile);
            if (body.Tagged is { } tagged) prefs[NotificationTypes.Tagged] = tagged;
            if (body.Like is { } like) prefs[NotificationTypes.Like] = like;
            if (body.Comment is { } comment) prefs[NotificationTypes.Comment] = comment;
            if (body.Follow is { } follow) prefs[NotificationTypes.Follow] = follow;
            if (body.FriendRating is { } friendRating) prefs[NotificationTypes.FriendRating] = friendRating;

            await db.UpdateAsync(Keys.User(userId), Keys.ProfileSk, "SET notificationPrefs = :prefs",
                new Dictionary<string, AttributeValue> { [":prefs"] = NotificationPrefs.ToAttribute(prefs) }, ct);

            return Results.Json(ToDto(prefs), ApiJsonSerializerContext.Default.NotificationPrefsDto);
        });

        return app;
    }

    private static NotificationPrefsDto ToDto(IReadOnlyDictionary<string, bool> prefs) => new(
        prefs[NotificationTypes.Tagged],
        prefs[NotificationTypes.Like],
        prefs[NotificationTypes.Comment],
        prefs[NotificationTypes.Follow],
        prefs[NotificationTypes.FriendRating]);
}
