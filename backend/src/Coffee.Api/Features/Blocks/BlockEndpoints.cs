using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Moderation;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Features.Blocks;

public sealed record BlockBody(string? Username);
public sealed record BlockDto(string UserId, string Username, string DisplayName, string BlockedAt);
public sealed record BlockListDto(IReadOnlyList<BlockDto> Blocks);

/// <summary>
/// Blocking (App Store 1.2 / Google Play UGC). A block is two rows — <c>USER#&lt;me&gt;/BLOCK#&lt;them&gt;</c>
/// (what <c>GET /v1/blocks</c> lists) and the mirror <c>USER#&lt;them&gt;/BLOCKEDBY#&lt;me&gt;</c> — so either
/// side finds every block that concerns it with one query (<see cref="BlockList"/>). Blocking also
/// ends follows in both directions; unblocking does not bring them back.
/// </summary>
public static class BlockEndpoints
{
    /// <summary>The 403 code for a follow / like / comment / tag across a block.</summary>
    public const string BlockedError = "blocked";

    public static IEndpointRouteBuilder MapBlockEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/v1/blocks", async (AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var rows = await db.QueryPrefixAsync(Keys.User(userId), Keys.BlockPrefix, ct);
            var blocks = rows
                .Select(ToDto)
                .OrderByDescending(b => b.BlockedAt, StringComparer.Ordinal)
                .ToList();
            return Results.Json(new BlockListDto(blocks), ApiJsonSerializerContext.Default.BlockListDto);
        });

        // Idempotent: blocking again answers 201 with the original row and re-applies the side effects
        // (a retry after a half-finished first attempt completes it).
        app.MapPost("/v1/blocks", async (BlockBody body, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var target = (body.Username ?? string.Empty).Trim();
            if (target.Length == 0) return ApiResults.BadRequest("username is required");

            var profile = await db.ProfileByUsernameAsync(target, ct);
            if (profile is null) return ApiResults.NotFound("user_not_found");

            var blockedId = profile.StrOr(Attr.UserId, string.Empty);
            if (blockedId.Length == 0) return ApiResults.NotFound("user_not_found");
            if (blockedId == userId) return ApiResults.BadRequest("cannot_block_self");

            var existing = await db.GetAsync(Keys.User(userId), Keys.BlockSk(blockedId), ct);
            var blockedAt = existing?.Str(Attr.BlockedAt) ?? Timestamps.Now();
            var blockedUsername = profile.StrOr(Attr.Username, UserDirectory.Normalize(target));
            var blockedDisplayName = profile.StrOr(Attr.DisplayName, blockedUsername);
            var (ownUsername, ownDisplayName) = await db.IdentityAsync(userId, ct);

            // One transaction: both block rows, and every follow between the two in either direction
            // (FRIEND# on the follower's partition, FOLLOWER# mirror on the followed one's). Deleting a
            // row that does not exist is a no-op, so this is safe to repeat.
            await db.TransactWriteAsync(
            [
                db.PutTransact(new Dictionary<string, AttributeValue>
                {
                    [Attr.Pk] = Av.S(Keys.User(userId)),
                    [Attr.Sk] = Av.S(Keys.BlockSk(blockedId)),
                    [Attr.UserId] = Av.S(blockedId),
                    [Attr.Username] = Av.S(blockedUsername),
                    [Attr.DisplayName] = Av.S(blockedDisplayName),
                    [Attr.BlockedAt] = Av.S(blockedAt),
                    [Attr.EntityType] = Av.S("Block"),
                }),
                db.PutTransact(new Dictionary<string, AttributeValue>
                {
                    [Attr.Pk] = Av.S(Keys.User(blockedId)),
                    [Attr.Sk] = Av.S(Keys.BlockedBySk(userId)),
                    [Attr.UserId] = Av.S(userId),
                    [Attr.Username] = Av.S(ownUsername),
                    [Attr.DisplayName] = Av.S(ownDisplayName),
                    [Attr.BlockedAt] = Av.S(blockedAt),
                    [Attr.EntityType] = Av.S("BlockedBy"),
                }),
                DeleteTransact(db, Keys.User(userId), Keys.FriendSk(blockedId)),
                DeleteTransact(db, Keys.User(blockedId), Keys.FollowerSk(userId)),
                DeleteTransact(db, Keys.User(blockedId), Keys.FriendSk(userId)),
                DeleteTransact(db, Keys.User(userId), Keys.FollowerSk(blockedId)),
            ], ct);

            return Results.Json(
                new BlockDto(blockedId, blockedUsername, blockedDisplayName, blockedAt),
                ApiJsonSerializerContext.Default.BlockDto,
                statusCode: StatusCodes.Status201Created);
        });

        // Unblock: both rows go. Idempotent. Follows removed by the block stay removed.
        app.MapDelete("/v1/blocks/{blockedUserId}", async (
            string blockedUserId, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            await db.DeleteAsync(Keys.User(userId), Keys.BlockSk(blockedUserId), ct);
            await db.DeleteAsync(Keys.User(blockedUserId), Keys.BlockedBySk(userId), ct);
            return ApiResults.Deleted();
        });

        return app;
    }

    private static BlockDto ToDto(Dictionary<string, AttributeValue> row)
    {
        var username = row.StrOr(Attr.Username, string.Empty);
        return new BlockDto(
            row.StrOr(Attr.UserId, BlockList.OtherUserId(row.StrOr(Attr.Sk, string.Empty)) ?? string.Empty),
            username,
            row.StrOr(Attr.DisplayName, username),
            row.StrOr(Attr.BlockedAt, string.Empty));
    }

    private static TransactWriteItem DeleteTransact(CoffeeDb db, string pk, string sk) =>
        new() { Delete = new Delete { TableName = db.TableName, Key = CoffeeDb.Key(pk, sk) } };
}
