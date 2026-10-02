using System.Net;
using System.Text.Json;
using Amazon.DynamoDBv2.Model;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// Blocking (App Store 1.2): the endpoints themselves, the follows a block ends, every read path
/// that must hide the other side, every write path that must refuse with 403 <c>blocked</c>, and
/// what an unblock gives back.
/// </summary>
public class BlockTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    [SkippableFact]
    public async Task Blocking_is_idempotent_listed_and_validated()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("blocker");
        var them = await RegisterAsync("blocked");

        var first = await BlockAsync(me, them.Username);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var created = await ReadJsonAsync(first);
        Assert.Equal(them.UserId, created.GetProperty("userId").GetString());
        Assert.Equal(them.Username, created.GetProperty("username").GetString());
        Assert.Equal("blocked tester", created.GetProperty("displayName").GetString());
        var blockedAt = created.GetProperty("blockedAt").GetString();

        // Again (and with different casing): same row, same timestamp, still 201.
        var again = await BlockAsync(me, them.Username.ToUpperInvariant());
        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
        Assert.Equal(blockedAt, (await ReadJsonAsync(again)).GetProperty("blockedAt").GetString());

        var list = await ReadJsonAsync(await Client(me.Token).GetAsync("/v1/blocks"));
        var only = Assert.Single(list.GetProperty("blocks").EnumerateArray());
        Assert.Equal(them.UserId, only.GetProperty("userId").GetString());

        // The other side has no BLOCK# of its own, only the mirror.
        Assert.Empty((await ReadJsonAsync(await Client(them.Token).GetAsync("/v1/blocks"))).GetProperty("blocks").EnumerateArray());
        Assert.NotNull(await RowAsync($"USER#{them.UserId}", $"BLOCKEDBY#{me.UserId}"));

        var self = await BlockAsync(me, me.Username);
        Assert.Equal(HttpStatusCode.BadRequest, self.StatusCode);
        Assert.Equal("cannot_block_self", await ErrorAsync(self));

        var missing = await BlockAsync(me, "nobody_here_at_all");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("user_not_found", await ErrorAsync(missing));

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/v1/blocks")).StatusCode);
    }

    [SkippableFact]
    public async Task Blocking_removes_follows_in_both_directions()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("bfollow");
        var them = await RegisterAsync("bfollowed");
        await FollowAsync(me, them);
        await FollowAsync(them, me);

        Assert.Equal(HttpStatusCode.Created, (await BlockAsync(me, them.Username)).StatusCode);

        Assert.Null(await RowAsync($"USER#{me.UserId}", $"FRIEND#{them.UserId}"));
        Assert.Null(await RowAsync($"USER#{me.UserId}", $"FOLLOWER#{them.UserId}"));
        Assert.Null(await RowAsync($"USER#{them.UserId}", $"FRIEND#{me.UserId}"));
        Assert.Null(await RowAsync($"USER#{them.UserId}", $"FOLLOWER#{me.UserId}"));
        Assert.Empty((await ReadJsonAsync(await Client(me.Token).GetAsync("/v1/friends"))).GetProperty("friends").EnumerateArray());
        Assert.Empty((await ReadJsonAsync(await Client(them.Token).GetAsync("/v1/followers"))).GetProperty("followers").EnumerateArray());
    }

    [SkippableFact]
    public async Task A_block_hides_the_other_side_everywhere_and_unblocking_restores_it()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("bhider");
        var them = await RegisterAsync("bhidden");
        var bystander = await RegisterAsync("bbystand");
        var place = $"place_{Guid.NewGuid():N}";

        // Their rating at a shared place tags me (so it reaches my feed through TAGGED#); a third
        // person's rating carries reactions from both of us.
        var theirs = await CreateRatingAsync(them, place, "Shared", 4, "Cortado", 0,
            $$"""[{"username":"{{me.Username}}"}]""");
        var mine = await CreateRatingAsync(me, place, "Shared", 3, "Mocha");
        var neutral = await CreateRatingAsync(bystander, place, "Shared", 5, "Filter");
        Assert.Equal(HttpStatusCode.OK, (await Client(me.Token).PostAsync($"/v1/ratings/{neutral}/like", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client(them.Token).PostAsync($"/v1/ratings/{neutral}/like", null)).StatusCode);
        await CommentAsync(me, neutral, "mine");
        await CommentAsync(them, neutral, "theirs");

        Assert.Contains(theirs, await FeedAsync(me));
        Assert.Contains(theirs, RatingIds(await PageAsync(me, $"/v1/places/{place}/ratings?limit=50")));

        Assert.Equal(HttpStatusCode.Created, (await BlockAsync(me, them.Username)).StatusCode);

        // Feed, place ratings, "coffees with me".
        Assert.DoesNotContain(theirs, await FeedAsync(me));
        var placeRatings = RatingIds(await PageAsync(me, $"/v1/places/{place}/ratings?limit=50")).ToList();
        Assert.DoesNotContain(theirs, placeRatings);
        Assert.Contains(mine, placeRatings);
        Assert.DoesNotContain(mine, RatingIds(await PageAsync(them, $"/v1/places/{place}/ratings?limit=50")));
        Assert.DoesNotContain(theirs, RatingIds(await PageAsync(me, $"/v1/users/{me.Username}/tagged")));

        // Rating detail: their rating is gone for me (and mine for them); on a third person's rating
        // their like and comment are hidden from me, and the counters match what is shown.
        Assert.Equal(HttpStatusCode.NotFound, (await Client(me.Token).GetAsync($"/v1/ratings/{theirs}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client(them.Token).GetAsync($"/v1/ratings/{mine}")).StatusCode);
        var detail = await ReadJsonAsync(await Client(me.Token).GetAsync($"/v1/ratings/{neutral}"));
        Assert.Equal([me.UserId], UserIds(detail.GetProperty("likes")));
        Assert.Equal([me.UserId], UserIds(detail.GetProperty("comments")));
        Assert.Equal(1, detail.GetProperty("rating").GetProperty("likeCount").GetInt32());
        Assert.Equal(1, detail.GetProperty("rating").GetProperty("commentCount").GetInt32());
        var theirView = await ReadJsonAsync(await Client(them.Token).GetAsync($"/v1/ratings/{neutral}"));
        Assert.Equal([them.UserId], UserIds(theirView.GetProperty("comments")));
        // A bystander still sees everything.
        var bystanderView = await ReadJsonAsync(await Client(bystander.Token).GetAsync($"/v1/ratings/{neutral}"));
        Assert.Equal(2, bystanderView.GetProperty("comments").GetArrayLength());

        // Search (also the companion picker), both directions.
        Assert.DoesNotContain(them.Username, await SearchAsync(me, them.Username));
        Assert.DoesNotContain(me.Username, await SearchAsync(them, me.Username));
        Assert.Contains(them.Username, await SearchAsync(bystander, them.Username));

        // Profile and its lists: 404 for a signed-in caller on either side, unchanged for anonymous.
        Assert.Equal(HttpStatusCode.NotFound, (await Client(me.Token).GetAsync($"/v1/users/{them.Username}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client(them.Token).GetAsync($"/v1/users/{me.Username}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client(me.Token).GetAsync($"/v1/users/{them.Username}/ratings")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client(me.Token).GetAsync($"/v1/users/{them.Username}/places")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client(me.Token).GetAsync($"/v1/users/{them.Username}/caffeine")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client(me.Token).GetAsync($"/v1/users/{them.Username}/tagged")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client().GetAsync($"/v1/users/{them.Username}")).StatusCode);
        Assert.Contains(theirs, RatingIds(await ReadJsonAsync(await Client().GetAsync($"/v1/users/{them.Username}/ratings"))));

        // Unblock: everything is visible again (the follows a block ended stay ended).
        var unblock = await Client(me.Token).DeleteAsync($"/v1/blocks/{them.UserId}");
        Assert.Equal(HttpStatusCode.OK, unblock.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client(me.Token).DeleteAsync($"/v1/blocks/{them.UserId}")).StatusCode);
        Assert.Null(await RowAsync($"USER#{them.UserId}", $"BLOCKEDBY#{me.UserId}"));

        Assert.Contains(theirs, await FeedAsync(me));
        Assert.Equal(HttpStatusCode.OK, (await Client(me.Token).GetAsync($"/v1/ratings/{theirs}")).StatusCode);
        Assert.Equal(2, (await ReadJsonAsync(await Client(me.Token).GetAsync($"/v1/ratings/{neutral}")))
            .GetProperty("comments").GetArrayLength());
        Assert.Contains(them.Username, await SearchAsync(me, them.Username));
        Assert.Equal(HttpStatusCode.OK, (await Client(me.Token).GetAsync($"/v1/users/{them.Username}")).StatusCode);
        Assert.Contains(theirs, RatingIds(await PageAsync(me, $"/v1/places/{place}/ratings?limit=50")));
    }

    [SkippableFact]
    public async Task Discover_friend_counts_drop_a_blocked_friend()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("bmap");
        var friend = await RegisterAsync("bmapfr");
        var place = $"place_{Guid.NewGuid():N}";
        await CreateRatingAsync(friend, place, "Far North", 4, "Latte", lat: 71.2, lng: 71.2);
        await FollowAsync(me, friend);

        Assert.Equal(1, await FriendCountAsync(me, place));

        Assert.Equal(HttpStatusCode.Created, (await BlockAsync(friend, me.Username)).StatusCode);

        Assert.Equal(0, await FriendCountAsync(me, place));
    }

    [SkippableFact]
    public async Task Follow_like_comment_and_tag_across_a_block_are_refused()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("bwrite");
        var them = await RegisterAsync("bwritten");
        var place = $"place_{Guid.NewGuid():N}";
        var theirs = await CreateRatingAsync(them, place, "Somewhere", 4, "Latte");
        var mine = await CreateRatingAsync(me, place, "Somewhere", 4, "Espresso");
        // I liked their rating before the block; taking that back must still work afterwards.
        Assert.Equal(HttpStatusCode.OK, (await Client(me.Token).PostAsync($"/v1/ratings/{theirs}/like", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Created, (await BlockAsync(them, me.Username)).StatusCode);

        // Both directions: the blocked person and the blocker.
        await AssertBlockedAsync(await Client(me.Token).PostAsync("/v1/friends",
            Body($$"""{"friendUsername":"{{them.Username}}"}""")));
        await AssertBlockedAsync(await Client(them.Token).PostAsync("/v1/friends",
            Body($$"""{"friendUsername":"{{me.Username}}"}""")));
        await AssertBlockedAsync(await Client(them.Token).PostAsync($"/v1/ratings/{mine}/like", null));
        await AssertBlockedAsync(await Client(me.Token).PostAsync($"/v1/ratings/{theirs}/comments", Body("""{"text":"hi"}""")));
        await AssertBlockedAsync(await Client(them.Token).PostAsync($"/v1/ratings/{mine}/comments", Body("""{"text":"hi"}""")));

        // Un-liking is allowed (it removes my reaction, it does not add one).
        var unlike = await ReadJsonAsync(await Client(me.Token).PostAsync($"/v1/ratings/{theirs}/like", null));
        Assert.False(unlike.GetProperty("liked").GetBoolean());
        await AssertBlockedAsync(await Client(me.Token).PostAsync($"/v1/ratings/{theirs}/like", null));

        // Tagging on create and on edit.
        await AssertBlockedAsync(await Client(me.Token).PostAsync("/v1/ratings", Body($$"""
            {
              "placeId": "{{place}}", "placeName": "Somewhere", "stars": 4, "drinkName": "Latte",
              "lat": 54.6872, "lng": 25.2797, "companions": [{"username":"{{them.Username}}"}]
            }
            """)));
        await AssertBlockedAsync(await Client(them.Token).PutAsync($"/v1/ratings/{theirs}",
            Body($$"""{"companions":[{"username":"{{me.Username}}"}]}""")));
        // A guest name is not a user and is fine.
        Assert.Equal(HttpStatusCode.OK, (await Client(them.Token).PutAsync($"/v1/ratings/{theirs}",
            Body("""{"companions":[{"displayName":"Guest Ona"}]}"""))).StatusCode);
    }

    [SkippableFact]
    public async Task A_companion_tagged_before_the_block_does_not_lock_the_author_out_of_editing()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("bedit");
        var companion = await RegisterAsync("beditc");
        var rating = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Cafe", 4, "Latte", 0,
            $$"""[{"username":"{{companion.Username}}"}]""");

        Assert.Equal(HttpStatusCode.Created, (await BlockAsync(companion, author.Username)).StatusCode);

        var edit = await Client(author.Token).PutAsync($"/v1/ratings/{rating}",
            Body($$"""{"stars":5,"companions":[{"username":"{{companion.Username}}"},{"displayName":"Guest"}]}"""));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private Task<HttpResponseMessage> BlockAsync(TestUser who, string username) =>
        Client(who.Token).PostAsync("/v1/blocks", Body($$"""{"username":"{{username}}"}"""));

    private async Task FollowAsync(TestUser follower, TestUser target) =>
        Assert.Equal(HttpStatusCode.Created, (await Client(follower.Token).PostAsync("/v1/friends",
            Body($$"""{"friendUsername":"{{target.Username}}"}"""))).StatusCode);

    private async Task CommentAsync(TestUser who, string ratingId, string text) =>
        Assert.Equal(HttpStatusCode.Created, (await Client(who.Token).PostAsync(
            $"/v1/ratings/{ratingId}/comments", Body($$"""{"text":"{{text}}"}"""))).StatusCode);

    private async Task<List<string>> FeedAsync(TestUser who) =>
        [.. RatingIds(await PageAsync(who, "/v1/feed?limit=50"))];

    private async Task<JsonElement> PageAsync(TestUser who, string path)
    {
        var response = await Client(who.Token).GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await ReadJsonAsync(response);
    }

    private async Task<List<string>> SearchAsync(TestUser who, string q) =>
        [.. (await PageAsync(who, $"/v1/users/search?q={q}")).GetProperty("users").EnumerateArray()
            .Select(u => u.GetProperty("username").GetString()!)];

    private async Task<int> FriendCountAsync(TestUser who, string placeId)
    {
        var places = await PageAsync(who, "/v1/places?bbox=71.0,71.0,71.5,71.5");
        return places.GetProperty("places").EnumerateArray()
            .Single(p => p.GetProperty("placeId").GetString() == placeId)
            .GetProperty("friendCount").GetInt32();
    }

    private static List<string> UserIds(JsonElement array) =>
        [.. array.EnumerateArray().Select(e => e.GetProperty("userId").GetString()!)];

    private static async Task AssertBlockedAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("blocked", await ErrorAsync(response));
    }

    private static async Task<string?> ErrorAsync(HttpResponseMessage response) =>
        (await ReadJsonAsync(response)).GetProperty("error").GetString();

    private async Task<Dictionary<string, AttributeValue>?> RowAsync(string pk, string sk)
    {
        var response = await Fixture.Dynamo.GetItemAsync(new GetItemRequest
        {
            TableName = Fixture.TableName,
            Key = new Dictionary<string, AttributeValue> { ["PK"] = new() { S = pk }, ["SK"] = new() { S = sk } },
            ConsistentRead = true,
        });
        return response.IsItemSet ? response.Item : null;
    }
}
