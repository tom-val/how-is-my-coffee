using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Push;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Features.Friends;

public sealed record FriendDto(string FriendUserId, string FriendUsername, string FriendDisplayName, string AddedAt);
public sealed record FollowerDto(string FollowerUserId, string FollowerUsername, string FollowerDisplayName, string FollowedAt);
public sealed record FriendListDto(IReadOnlyList<FriendDto> Friends);
public sealed record FollowerListDto(IReadOnlyList<FollowerDto> Followers);
public sealed record AddFriendBody(string? FriendUsername);

/// <summary>
/// "Friends" are really follows: adding one writes a <c>FRIEND#</c> row on your partition and a
/// mirrored <c>FOLLOWER#</c> row on theirs, so both directions are a single-partition query. Names
/// are denormalised onto both rows — a rename does not rewrite them, matching the old behaviour.
/// </summary>
public static class FriendEndpoints
{
    public static IEndpointRouteBuilder MapFriendEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/v1/friends", async (AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var items = await db.QueryPrefixAsync(Keys.User(userId), Keys.FriendPrefix, ct);
            var friends = items.Select(i => new FriendDto(
                i.StrOr(Attr.FriendUserId, string.Empty),
                i.StrOr(Attr.FriendUsername, string.Empty),
                i.StrOr(Attr.FriendDisplayName, string.Empty),
                i.StrOr(Attr.AddedAt, string.Empty))).ToList();

            return Results.Json(new FriendListDto(friends), ApiJsonSerializerContext.Default.FriendListDto);
        });

        app.MapGet("/v1/followers", async (AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var items = await db.QueryPrefixAsync(Keys.User(userId), Keys.FollowerPrefix, ct);
            var followers = items.Select(i => new FollowerDto(
                i.StrOr(Attr.FollowerUserId, string.Empty),
                i.StrOr(Attr.FollowerUsername, string.Empty),
                i.StrOr(Attr.FollowerDisplayName, string.Empty),
                i.StrOr(Attr.FollowedAt, string.Empty))).ToList();

            return Results.Json(new FollowerListDto(followers), ApiJsonSerializerContext.Default.FollowerListDto);
        });

        // Idempotent: following twice simply rewrites the same two rows.
        app.MapPost("/v1/friends", async (
            AddFriendBody body, AuthContext auth, CoffeeDb db, Notifier notifier, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var target = (body.FriendUsername ?? string.Empty).Trim();
            if (target.Length == 0) return ApiResults.BadRequest("friendUsername is required");

            var normalized = UserDirectory.Normalize(target);
            var friendUserId = await db.UserIdByUsernameAsync(normalized, ct);
            if (friendUserId is null) return ApiResults.NotFound("user_not_found");
            if (friendUserId == userId) return ApiResults.BadRequest("cannot_add_self");

            // Whether this is a new follow decides whether they get a push; the rows themselves are
            // rewritten either way, so re-adding stays idempotent.
            var alreadyFollowing =
                await db.GetAsync(Keys.User(userId), Keys.FriendSk(friendUserId), ct, Attr.Pk) is not null;

            var (friendUsername, friendDisplayName) = await db.IdentityAsync(friendUserId, ct);
            var (ownUsername, ownDisplayName) = await db.IdentityAsync(userId, ct);
            var now = Timestamps.Now();

            await db.PutAsync(new Dictionary<string, AttributeValue>
            {
                [Attr.Pk] = Av.S(Keys.User(userId)),
                [Attr.Sk] = Av.S(Keys.FriendSk(friendUserId)),
                [Attr.FriendUserId] = Av.S(friendUserId),
                [Attr.FriendUsername] = Av.S(friendUsername.Length > 0 ? friendUsername : normalized),
                [Attr.FriendDisplayName] = Av.S(friendDisplayName.Length > 0 ? friendDisplayName : normalized),
                [Attr.AddedAt] = Av.S(now),
                [Attr.EntityType] = Av.S("Friend"),
            }, ct);

            await db.PutAsync(new Dictionary<string, AttributeValue>
            {
                [Attr.Pk] = Av.S(Keys.User(friendUserId)),
                [Attr.Sk] = Av.S(Keys.FollowerSk(userId)),
                [Attr.FollowerUserId] = Av.S(userId),
                [Attr.FollowerUsername] = Av.S(ownUsername),
                [Attr.FollowerDisplayName] = Av.S(ownDisplayName),
                [Attr.FollowedAt] = Av.S(now),
                [Attr.EntityType] = Av.S("Follower"),
            }, ct);

            if (!alreadyFollowing)
            {
                await notifier.FollowAsync(
                    friendUserId, new NotificationActor(userId, ownUsername, ownDisplayName), ct);
            }

            return Results.Json(
                new FriendDto(friendUserId, friendUsername.Length > 0 ? friendUsername : normalized, friendDisplayName, now),
                ApiJsonSerializerContext.Default.FriendDto,
                statusCode: StatusCodes.Status201Created);
        });

        // Unfollow. Both rows go; DynamoDB deletes are idempotent, so a repeat is still a 200.
        app.MapDelete("/v1/friends/{friendUserId}", async (
            string friendUserId, AuthContext auth, CoffeeDb db, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            await db.DeleteAsync(Keys.User(userId), Keys.FriendSk(friendUserId), ct);
            await db.DeleteAsync(Keys.User(friendUserId), Keys.FollowerSk(userId), ct);
            return ApiResults.Deleted();
        });

        return app;
    }
}
