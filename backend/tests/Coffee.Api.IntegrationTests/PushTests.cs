using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Amazon.DynamoDBv2.Model;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// Push notifications end to end: device registration, the preference document, and one scenario
/// per notification type.
/// <para>
/// These run against <see cref="IntegrationFixture.PushHost"/> — the same app and the same table,
/// but with <c>Push:Enabled=true</c> and Expo swapped for <see cref="CapturingPushSender"/>. The
/// rest of the suite leaves push off, so only what is asserted here ever builds a message.
/// </para>
/// </summary>
public class PushTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    private const string Token = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";

    // ── Device registration ─────────────────────────────────────────────────

    [SkippableFact]
    public async Task Registering_a_token_writes_one_row_and_re_registering_updates_it_in_place()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("pushreg");

        var first = await PushClient(user.Token).PutAsync("/v1/push/tokens",
            Body($$"""{"token":"{{Token}}","platform":"ios"}"""));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal("ok", (await ReadJsonAsync(first)).GetProperty("status").GetString());

        var created = await TokenRowAsync(user.UserId, Token);
        Assert.NotNull(created);
        Assert.Equal(Token, created["token"].S);
        Assert.Equal("ios", created["platform"].S);
        var createdAt = created["createdAt"].S;

        // A re-register (every cold start of the app, and a platform switch) is an upsert, not a
        // second row — and it must not rewrite createdAt.
        var second = await PushClient(user.Token).PutAsync("/v1/push/tokens",
            Body($$"""{"token":"{{Token}}","platform":"android"}"""));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        var rows = await TokenRowsAsync(user.UserId);
        var only = Assert.Single(rows);
        Assert.Equal("android", only["platform"].S);
        Assert.Equal(createdAt, only["createdAt"].S);
        Assert.True(string.CompareOrdinal(only["lastSeenAt"].S, createdAt) >= 0);
    }

    [SkippableTheory]
    [InlineData("""{"token":"not-a-token","platform":"ios"}""", "invalid_token")]
    [InlineData("""{"token":"ExponentPushToken[bad char]","platform":"ios"}""", "invalid_token")]
    [InlineData("""{"token":"","platform":"ios"}""", "invalid_token")]
    [InlineData("""{"token":"ExponentPushToken[abc]","platform":"windows"}""", "invalid_platform")]
    [InlineData("""{"token":"ExponentPushToken[abc]"}""", "invalid_platform")]
    public async Task A_malformed_registration_is_rejected(string body, string expectedError)
    {
        RequireInfrastructure();
        var user = await RegisterAsync("pushbad");

        var response = await PushClient(user.Token).PutAsync("/v1/push/tokens", Body(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(expectedError, (await ReadJsonAsync(response)).GetProperty("error").GetString());
    }

    [SkippableFact]
    public async Task The_newer_ExpoPushToken_spelling_is_accepted_too()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("pushnew");

        var response = await PushClient(user.Token).PutAsync("/v1/push/tokens",
            Body("""{"token":"ExpoPushToken[xxxxxxxx-yyyy_zzzz]","platform":"android"}"""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [SkippableFact]
    public async Task Deleting_a_token_is_idempotent_and_removes_the_row()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("pushdel");
        await RegisterTokenAsync(user, Token);

        var path = $"/v1/push/tokens/{Uri.EscapeDataString(Token)}";
        var first = await PushClient(user.Token).DeleteAsync(path);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal("deleted", (await ReadJsonAsync(first)).GetProperty("status").GetString());
        Assert.Empty(await TokenRowsAsync(user.UserId));

        // Signing out twice (or from a device whose token was already pruned) is still a 200.
        Assert.Equal(HttpStatusCode.OK, (await PushClient(user.Token).DeleteAsync(path)).StatusCode);
    }

    [SkippableFact]
    public async Task Every_push_endpoint_needs_a_token()
    {
        RequireInfrastructure();
        var anonymous = PushClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PutAsync("/v1/push/tokens", Body($$"""{"token":"{{Token}}","platform":"ios"}"""))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.DeleteAsync($"/v1/push/tokens/{Uri.EscapeDataString(Token)}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/v1/notification-prefs")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PutAsync("/v1/notification-prefs", Body("""{"like":false}"""))).StatusCode);
    }

    // ── Preferences ─────────────────────────────────────────────────────────

    [SkippableFact]
    public async Task Preferences_default_to_all_on_and_a_put_merges_rather_than_replaces()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("pushpref");

        AssertPrefs(await ReadJsonAsync(await PushClient(user.Token).GetAsync("/v1/notification-prefs")),
            tagged: true, like: true, comment: true, follow: true, friendRating: true);

        var first = await PushClient(user.Token).PutAsync("/v1/notification-prefs", Body("""{"like":false}"""));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        AssertPrefs(await ReadJsonAsync(first), tagged: true, like: false, comment: true, follow: true, friendRating: true);

        // A second PUT carrying a different key must not reset the first one.
        var second = await PushClient(user.Token).PutAsync("/v1/notification-prefs",
            Body("""{"friendRating":false,"nonsense":true}"""));
        AssertPrefs(await ReadJsonAsync(second), tagged: true, like: false, comment: true, follow: true, friendRating: false);

        AssertPrefs(await ReadJsonAsync(await PushClient(user.Token).GetAsync("/v1/notification-prefs")),
            tagged: true, like: false, comment: true, follow: true, friendRating: false);

        // Switching one back on leaves the other one off.
        AssertPrefs(await ReadJsonAsync(await PushClient(user.Token).PutAsync("/v1/notification-prefs", Body("""{"like":true}"""))),
            tagged: true, like: true, comment: true, follow: true, friendRating: false);
    }

    // ── One scenario per notification type ──────────────────────────────────

    [SkippableFact]
    public async Task Creating_a_rating_notifies_registered_companions_and_the_authors_followers()
    {
        RequireInfrastructure();
        Fixture.PushSender.Reset();

        var author = await RegisterAsync("pauth");
        var companion = await RegisterAsync("pcomp");
        var follower = await RegisterAsync("pfoll");
        var stranger = await RegisterAsync("pstra");

        var companionToken = await RegisterTokenAsync(companion, "ExponentPushToken[companion0001]");
        var followerToken = await RegisterTokenAsync(follower, "ExponentPushToken[follower0001]");
        await RegisterTokenAsync(stranger, "ExponentPushToken[stranger0001]");
        await FollowAsync(follower, author);

        Fixture.PushSender.Reset();
        await CreatePushRatingAsync(author, "place_vero", "Vero Cafe", 4.5, "Latte",
            companionsJson: $$"""[{"username":"{{companion.Username}}"},{"displayName":"A guest"}]""");

        var tagged = Assert.Single(Fixture.PushSender.OfType("tagged"));
        Assert.Equal(companionToken, tagged.To);
        // RegisterAsync names every account "<prefix> tester", and the copy uses the display name.
        Assert.Equal("pauth tester had a coffee with you", tagged.Title);
        Assert.Equal("Latte at Vero Cafe", tagged.Body);
        Assert.Null(tagged.Data.Username);

        var friendRating = Assert.Single(Fixture.PushSender.OfType("friendRating"));
        Assert.Equal(followerToken, friendRating.To);
        Assert.Equal("pauth tester rated a coffee", friendRating.Title);
        Assert.Equal("Latte at Vero Cafe · 4.5★", friendRating.Body);
        Assert.Equal("default", friendRating.Sound);

        // The guest companion has no account, and a stranger follows nobody.
        Assert.DoesNotContain("ExponentPushToken[stranger0001]", Fixture.PushSender.RecipientsOf("friendRating"));
        Assert.All(Fixture.PushSender.Messages, m => Assert.NotNull(m.Data.RatingId));
    }

    [SkippableFact]
    public async Task Editing_a_rating_notifies_only_the_companions_the_edit_added()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("peauth");
        var original = await RegisterAsync("peorig");
        var added = await RegisterAsync("peadd");

        await RegisterTokenAsync(original, "ExponentPushToken[original0001]");
        var addedToken = await RegisterTokenAsync(added, "ExponentPushToken[added0001]");

        Fixture.PushSender.Reset();
        var ratingId = await CreatePushRatingAsync(author, "place_edit", "Edit Cafe", 4, "Cortado",
            companionsJson: $$"""[{"username":"{{original.Username}}"}]""");
        Assert.Equal(["ExponentPushToken[original0001]"], Fixture.PushSender.RecipientsOf("tagged"));

        // Re-saving with the same person plus one more: only the newcomer hears about it.
        Fixture.PushSender.Reset();
        var edit = await PushClient(author.Token).PutAsync($"/v1/ratings/{ratingId}", Body($$"""
            {"companions":[{"username":"{{original.Username}}"},{"username":"{{added.Username}}"}]}
            """));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);

        var tagged = Assert.Single(Fixture.PushSender.OfType("tagged"));
        Assert.Equal(addedToken, tagged.To);
        Assert.Equal("Cortado at Edit Cafe", tagged.Body);

        // An edit that changes nothing about the companions notifies nobody at all.
        Fixture.PushSender.Reset();
        await PushClient(author.Token).PutAsync($"/v1/ratings/{ratingId}", Body("""{"stars":3}"""));
        Assert.Empty(Fixture.PushSender.Messages);
    }

    [SkippableFact]
    public async Task A_like_notifies_the_author_once_and_never_for_your_own_rating()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("plauth");
        var liker = await RegisterAsync("pliker");
        var authorToken = await RegisterTokenAsync(author, "ExponentPushToken[likeauthor01]");
        await RegisterTokenAsync(liker, "ExponentPushToken[likeliker001]");

        var ratingId = await CreatePushRatingAsync(author, "place_like", "Like Cafe", 5, "Flat White");

        Fixture.PushSender.Reset();
        await PushClient(liker.Token).PostAsync($"/v1/ratings/{ratingId}/like", Body("{}"));

        var like = Assert.Single(Fixture.PushSender.OfType("like"));
        Assert.Equal(authorToken, like.To);
        Assert.Equal("pliker tester liked your Flat White", like.Title);
        Assert.Null(like.Body);
        Assert.Equal(ratingId, like.Data.RatingId);

        // Unliking is silent…
        Fixture.PushSender.Reset();
        await PushClient(liker.Token).PostAsync($"/v1/ratings/{ratingId}/like", Body("{}"));
        Assert.Empty(Fixture.PushSender.Messages);

        // …and so is liking your own rating.
        Fixture.PushSender.Reset();
        await PushClient(author.Token).PostAsync($"/v1/ratings/{ratingId}/like", Body("{}"));
        Assert.Empty(Fixture.PushSender.Messages);
    }

    [SkippableFact]
    public async Task A_comment_notifies_the_author_unless_the_author_wrote_it()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("pcauth");
        var commenter = await RegisterAsync("pcomm");
        var authorToken = await RegisterTokenAsync(author, "ExponentPushToken[commauthor01]");

        var ratingId = await CreatePushRatingAsync(author, "place_comment", "Comment Cafe", 4, "Espresso");

        Fixture.PushSender.Reset();
        await PushClient(commenter.Token).PostAsync($"/v1/ratings/{ratingId}/comments",
            Body("""{"text":"That looks great"}"""));

        var comment = Assert.Single(Fixture.PushSender.OfType("comment"));
        Assert.Equal(authorToken, comment.To);
        Assert.Equal("pcomm tester commented on your Espresso", comment.Title);
        Assert.Equal("That looks great", comment.Body);

        Fixture.PushSender.Reset();
        await PushClient(author.Token).PostAsync($"/v1/ratings/{ratingId}/comments",
            Body("""{"text":"Thanks, me"}"""));
        Assert.Empty(Fixture.PushSender.Messages);
    }

    [SkippableFact]
    public async Task A_long_comment_is_trimmed_to_a_notification_sized_body()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("pltauth");
        var commenter = await RegisterAsync("pltcomm");
        await RegisterTokenAsync(author, "ExponentPushToken[longauthor01]");

        var ratingId = await CreatePushRatingAsync(author, "place_long", "Long Cafe", 4, "Mocha");
        var text = new string('x', 300);

        Fixture.PushSender.Reset();
        await PushClient(commenter.Token).PostAsync($"/v1/ratings/{ratingId}/comments",
            Body($$"""{"text":"{{text}}"}"""));

        Assert.Equal(120, Assert.Single(Fixture.PushSender.OfType("comment")).Body!.Length);
    }

    [SkippableFact]
    public async Task Following_notifies_once_and_stays_quiet_when_the_friend_is_re_added()
    {
        RequireInfrastructure();
        var follower = await RegisterAsync("pffoll");
        var followed = await RegisterAsync("pfwed");
        var followedToken = await RegisterTokenAsync(followed, "ExponentPushToken[followed0001]");

        Fixture.PushSender.Reset();
        await FollowAsync(follower, followed);

        var follow = Assert.Single(Fixture.PushSender.OfType("follow"));
        Assert.Equal(followedToken, follow.To);
        Assert.Equal("pffoll tester started following you", follow.Title);
        Assert.Null(follow.Body);
        // The tap target for a follow is a profile, so the payload carries a username, not a rating.
        Assert.Null(follow.Data.RatingId);
        Assert.Equal(follower.Username, follow.Data.Username);

        Fixture.PushSender.Reset();
        await FollowAsync(follower, followed);
        Assert.Empty(Fixture.PushSender.Messages);
    }

    [SkippableFact]
    public async Task Unfollowing_and_deleting_a_rating_notify_nobody()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("pdauth");
        var follower = await RegisterAsync("pdfoll");
        await RegisterTokenAsync(author, "ExponentPushToken[delauthor001]");
        await RegisterTokenAsync(follower, "ExponentPushToken[delfoll00001]");
        await FollowAsync(follower, author);

        var ratingId = await CreatePushRatingAsync(author, "place_del", "Delete Cafe", 4, "Americano");

        Fixture.PushSender.Reset();
        await PushClient(author.Token).DeleteAsync($"/v1/ratings/{ratingId}");
        await PushClient(follower.Token).DeleteAsync($"/v1/friends/{author.UserId}");

        Assert.Empty(Fixture.PushSender.Messages);
    }

    [SkippableFact]
    public async Task Switching_one_preference_off_silences_that_type_and_only_that_type()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("ppauth");
        var other = await RegisterAsync("ppother");
        await RegisterTokenAsync(author, "ExponentPushToken[prefauthor01]");

        var ratingId = await CreatePushRatingAsync(author, "place_pref", "Pref Cafe", 4, "Latte");
        await PushClient(author.Token).PutAsync("/v1/notification-prefs", Body("""{"like":false}"""));

        Fixture.PushSender.Reset();
        await PushClient(other.Token).PostAsync($"/v1/ratings/{ratingId}/like", Body("{}"));
        Assert.Empty(Fixture.PushSender.OfType("like"));

        // Comments still arrive — one switch does not turn the others off.
        Fixture.PushSender.Reset();
        await PushClient(other.Token).PostAsync($"/v1/ratings/{ratingId}/comments", Body("""{"text":"Nice"}"""));
        Assert.Single(Fixture.PushSender.OfType("comment"));

        // And a follow to a user who turned `follow` off is silent while `comment` keeps working.
        await PushClient(author.Token).PutAsync("/v1/notification-prefs", Body("""{"follow":false}"""));
        Fixture.PushSender.Reset();
        await FollowAsync(other, author);
        Assert.Empty(Fixture.PushSender.Messages);
    }

    [SkippableFact]
    public async Task A_token_Expo_reports_as_unregistered_is_deleted()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("pdead");
        var liker = await RegisterAsync("pdeadl");
        var dead = await RegisterTokenAsync(author, "ExponentPushToken[deaddevice01]");

        var ratingId = await CreatePushRatingAsync(author, "place_dead", "Dead Cafe", 4, "Latte");

        Fixture.PushSender.Reset();
        Fixture.PushSender.DeadTokens.Add(dead);
        await PushClient(liker.Token).PostAsync($"/v1/ratings/{ratingId}/like", Body("{}"));

        Assert.Single(Fixture.PushSender.OfType("like"));
        Assert.Empty(await TokenRowsAsync(author.UserId));
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /// <summary>A client against the push-enabled host (same table, capturing sender).</summary>
    private HttpClient PushClient(string? token = null)
    {
        var client = Fixture.PushHost.CreateClient();
        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }

    private async Task<string> RegisterTokenAsync(TestUser user, string token)
    {
        var response = await PushClient(user.Token).PutAsync("/v1/push/tokens",
            Body($$"""{"token":"{{token}}","platform":"ios"}"""));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return token;
    }

    private async Task FollowAsync(TestUser follower, TestUser target)
    {
        var response = await PushClient(follower.Token).PostAsync("/v1/friends",
            Body($$"""{"friendUsername":"{{target.Username}}"}"""));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    /// <summary>Same body as <see cref="IntegrationTestBase.CreateRatingAsync"/>, sent to the push host.</summary>
    private async Task<string> CreatePushRatingAsync(
        TestUser author, string placeId, string placeName, double stars, string drinkName,
        string companionsJson = "[]")
    {
        var response = await PushClient(author.Token).PostAsync("/v1/ratings", Body($$"""
            {
              "placeId": "{{placeId}}", "placeName": "{{placeName}}",
              "stars": {{Number(stars)}}, "drinkName": "{{drinkName}}", "caffeineMg": 80,
              "lat": 54.6872, "lng": 25.2797, "address": "Gedimino pr. 9",
              "companions": {{companionsJson}}
            }
            """));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await ReadJsonAsync(response)).GetProperty("ratingId").GetString()!;
    }

    private async Task<List<Dictionary<string, AttributeValue>>> TokenRowsAsync(string userId)
    {
        var response = await Fixture.Dynamo.QueryAsync(new QueryRequest
        {
            TableName = Fixture.TableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = new() { S = $"USER#{userId}" },
                [":sk"] = new() { S = "PUSH#" },
            },
        });
        return response.Items;
    }

    private async Task<Dictionary<string, AttributeValue>?> TokenRowAsync(string userId, string token) =>
        (await TokenRowsAsync(userId)).SingleOrDefault(i => i["SK"].S == $"PUSH#{token}");

    private static void AssertPrefs(
        JsonElement prefs, bool tagged, bool like, bool comment, bool follow, bool friendRating)
    {
        Assert.Equal(tagged, prefs.GetProperty("tagged").GetBoolean());
        Assert.Equal(like, prefs.GetProperty("like").GetBoolean());
        Assert.Equal(comment, prefs.GetProperty("comment").GetBoolean());
        Assert.Equal(follow, prefs.GetProperty("follow").GetBoolean());
        Assert.Equal(friendRating, prefs.GetProperty("friendRating").GetBoolean());
    }
}
