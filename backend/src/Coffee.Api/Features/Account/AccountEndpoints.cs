using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Serialization;
using Microsoft.AspNetCore.Mvc;

namespace Coffee.Api.Features.Account;

public sealed record DeleteAccountBody(string? Password);

/// <summary>
/// <c>DELETE /v1/me</c> — the in-app account deletion the App Store and Google Play require.
/// </summary>
public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        // DELETE does not infer a JSON body, hence the explicit [FromBody]. Nullable, so a missing
        // body is just a wrong password rather than a framework 400.
        app.MapDelete("/v1/me", async (
            [FromBody] DeleteAccountBody? body, AuthContext auth, CoffeeDb db, AccountDeleter deleter,
            ILoggerFactory loggers) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var profile = await db.ProfileAsync(userId, CancellationToken.None);
            if (profile is null) return ApiResults.Unauthorized();

            // Re-authentication: a stolen token alone must not be able to wipe an account. Legacy
            // scrypt hashes verify here exactly as they do at login.
            if (!PasswordHasher.Verify(body?.Password ?? string.Empty, profile.Str(Attr.PasswordHash)))
                return ApiResults.Unauthorized("invalid_credentials");

            // Deliberately not the request's token: a client that gives up waiting must not stop the
            // deletion half-way. (A retry would finish it, but only if the client comes back.)
            var summary = await deleter.DeleteAsync(profile, CancellationToken.None);

            loggers.CreateLogger(typeof(AccountEndpoints)).LogInformation(
                "Deleted account {UserId}: {Ratings} ratings, {Photos} photos, {Reactions} likes/comments, "
                + "{Tags} tags, {Follows} follows, {Followers} followers, {OtherRows} other rows",
                userId, summary.Ratings, summary.Photos, summary.Reactions, summary.Tags,
                summary.Follows, summary.Followers, summary.OtherRows);

            return ApiResults.Deleted();
        });

        return app;
    }
}
