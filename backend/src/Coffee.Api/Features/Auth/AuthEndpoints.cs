using System.Text.RegularExpressions;
using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Users;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Features.Auth;

public sealed record RegisterBody(string? Username, string? DisplayName, string? Password);
public sealed record LoginBody(string? Username, string? Password);
public sealed record AuthResponse(string Token, UserDto User);

/// <summary>
/// Username + password sign-up and sign-in. The API mints its own HS256 tokens (see
/// <see cref="JwtIssuer"/>) — there is no identity provider in this stack.
/// </summary>
public static partial class AuthEndpoints
{
    [GeneratedRegex("^[a-zA-Z0-9_]+$")]
    private static partial Regex UsernamePattern();

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        // Public. The USERNAME# partition is the uniqueness guard; the condition expression makes
        // the check-then-write atomic, so two simultaneous sign-ups cannot both win.
        app.MapPost("/v1/auth/register", async (
            RegisterBody body, CoffeeDb db, JwtIssuer jwt, CancellationToken ct) =>
        {
            var username = (body.Username ?? string.Empty).Trim();
            var displayName = (body.DisplayName ?? string.Empty).Trim();
            var password = body.Password ?? string.Empty;

            if (username.Length is < 3 or > 30 || !UsernamePattern().IsMatch(username))
                return ApiResults.BadRequest("username must be 3-30 characters of letters, digits or underscore");
            if (displayName.Length is < 1 or > 50)
                return ApiResults.BadRequest("displayName must be 1-50 characters");
            if (password.Length is < 6 or > 100)
                return ApiResults.BadRequest("password must be 6-100 characters");

            var normalized = UserDirectory.Normalize(username);
            var userId = Guid.NewGuid().ToString("D");
            var createdAt = Timestamps.Now();

            try
            {
                await db.Client.PutItemAsync(new PutItemRequest
                {
                    TableName = db.TableName,
                    Item = new Dictionary<string, AttributeValue>
                    {
                        [Attr.Pk] = Av.S(Keys.UsernameLookup(normalized)),
                        [Attr.Sk] = Av.S(Keys.UsernameSk),
                        [Attr.UserId] = Av.S(userId),
                        [Attr.Username] = Av.S(normalized),
                        [Attr.EntityType] = Av.S("UsernameIndex"),
                        // GSI1 backs the prefix search used by the companion picker.
                        [Attr.Gsi1Pk] = Av.S(Keys.UsernameIndexPk),
                        [Attr.Gsi1Sk] = Av.S(normalized),
                    },
                    ConditionExpression = "attribute_not_exists(PK)",
                }, ct);
            }
            catch (ConditionalCheckFailedException)
            {
                return ApiResults.Conflict("username_taken");
            }

            var profile = new Dictionary<string, AttributeValue>
            {
                [Attr.Pk] = Av.S(Keys.User(userId)),
                [Attr.Sk] = Av.S(Keys.ProfileSk),
                [Attr.UserId] = Av.S(userId),
                [Attr.Username] = Av.S(normalized),
                [Attr.DisplayName] = Av.S(displayName),
                [Attr.PasswordHash] = Av.S(PasswordHasher.Hash(password)),
                [Attr.TotalCaffeineMg] = Av.N(0),
                [Attr.CreatedAt] = Av.S(createdAt),
                [Attr.EntityType] = Av.S("User"),
            };
            await db.PutAsync(profile, ct);

            return Results.Json(
                new AuthResponse(jwt.Issue(userId, normalized), UserMapper.ToDto(profile)),
                ApiJsonSerializerContext.Default.AuthResponse,
                statusCode: StatusCodes.Status201Created);
        });

        // Public. A legacy scrypt hash still verifies and is replaced with a PBKDF2 one right here,
        // so the old format disappears as users come back rather than in a migration job.
        app.MapPost("/v1/auth/login", async (
            LoginBody body, CoffeeDb db, JwtIssuer jwt, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var username = (body.Username ?? string.Empty).Trim();
            var password = body.Password ?? string.Empty;
            if (username.Length == 0 || password.Length == 0)
                return ApiResults.BadRequest("username and password are required");

            var profile = await db.ProfileByUsernameAsync(username, ct);
            var storedHash = profile?.Str(Attr.PasswordHash);

            // Same answer for "no such user" and "wrong password": never confirm an account exists.
            if (profile is null || !PasswordHasher.Verify(password, storedHash))
                return ApiResults.Unauthorized("invalid_credentials");

            var userId = profile.StrOr(Attr.UserId, string.Empty);
            var storedUsername = profile.StrOr(Attr.Username, UserDirectory.Normalize(username));

            // Rows written by the old Node backend predate GSI1, so those accounts are invisible to
            // the username search until their lookup row carries the index keys. Backfill on login
            // (if_not_exists keeps it idempotent) instead of running a one-off migration job.
            await db.UpdateAsync(Keys.UsernameLookup(storedUsername), Keys.UsernameSk,
                "SET GSI1PK = if_not_exists(GSI1PK, :pk), GSI1SK = if_not_exists(GSI1SK, :sk)",
                new Dictionary<string, AttributeValue>
                {
                    [":pk"] = Av.S(Keys.UsernameIndexPk),
                    [":sk"] = Av.S(storedUsername),
                }, ct);

            if (PasswordHasher.NeedsRehash(storedHash))
            {
                var upgraded = PasswordHasher.Hash(password);
                await db.UpdateAsync(Keys.User(userId), Keys.ProfileSk, "SET passwordHash = :h",
                    new Dictionary<string, AttributeValue> { [":h"] = Av.S(upgraded) }, ct);
                profile[Attr.PasswordHash] = Av.S(upgraded);
                loggers.CreateLogger(typeof(AuthEndpoints))
                    .LogInformation("Upgraded legacy scrypt password hash for user {UserId}", userId);
            }

            return Results.Json(
                new AuthResponse(jwt.Issue(userId, profile.StrOr(Attr.Username, username)), UserMapper.ToDto(profile)),
                ApiJsonSerializerContext.Default.AuthResponse);
        });

        return app;
    }
}
