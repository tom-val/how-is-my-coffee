using System.Net;
using Amazon.DynamoDBv2.Model;
using Xunit;

namespace Coffee.Api.IntegrationTests;

public class RatingTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    [SkippableFact]
    public async Task Rating_with_companions_tags_the_registered_one_only()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("author");
        var friend = await RegisterAsync("friend");

        var ratingId = await CreateRatingAsync(
            author, $"place_{Guid.NewGuid():N}", "Caffe Nero", 4.5, "Flat White", 130,
            $$"""[{"username":"{{friend.Username}}"},{"displayName":"Guest Anna"}]""");

        var detail = await ReadJsonAsync(await Client(author.Token).GetAsync($"/v1/ratings/{ratingId}"));
        var companions = detail.GetProperty("rating").GetProperty("companions").EnumerateArray().ToList();

        Assert.Equal(2, companions.Count);
        var registered = companions.Single(c => c.TryGetProperty("userId", out var id) && id.ValueKind is System.Text.Json.JsonValueKind.String);
        Assert.Equal(friend.UserId, registered.GetProperty("userId").GetString());
        Assert.Equal(friend.Username, registered.GetProperty("username").GetString());

        var guest = companions.Single(c => c.GetProperty("userId").ValueKind is System.Text.Json.JsonValueKind.Null);
        Assert.Equal("Guest Anna", guest.GetProperty("displayName").GetString());

        // The tagged user finds it under "Coffees with me"; the guest leaves no row behind.
        var tagged = await ReadJsonAsync(
            await Client(friend.Token).GetAsync($"/v1/users/{friend.Username}/tagged"));
        Assert.Contains(ratingId, RatingIds(tagged));
    }

    [SkippableFact]
    public async Task Tagging_yourself_or_a_stranger_is_rejected()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("selftag");
        var placeId = $"place_{Guid.NewGuid():N}";

        var self = await Client(author.Token).PostAsync("/v1/ratings", Body($$"""
            {"placeId":"{{placeId}}","placeName":"X","stars":4,"drinkName":"Latte","lat":1,"lng":2,
             "companions":[{"username":"{{author.Username}}"}]}
            """));
        Assert.Equal(HttpStatusCode.BadRequest, self.StatusCode);
        Assert.Equal("cannot_tag_self", (await ReadJsonAsync(self)).GetProperty("error").GetString());

        var stranger = await Client(author.Token).PostAsync("/v1/ratings", Body($$"""
            {"placeId":"{{placeId}}","placeName":"X","stars":4,"drinkName":"Latte","lat":1,"lng":2,
             "companions":[{"username":"definitely_not_here"}]}
            """));
        Assert.Equal(HttpStatusCode.NotFound, stranger.StatusCode);
        Assert.Equal("user_not_found", (await ReadJsonAsync(stranger)).GetProperty("error").GetString());
    }

    [SkippableFact]
    public async Task Replacing_companions_moves_the_tag()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("retag");
        var first = await RegisterAsync("first");
        var second = await RegisterAsync("second");

        var ratingId = await CreateRatingAsync(
            author, $"place_{Guid.NewGuid():N}", "Caffe Nero", 4, "Latte", 130,
            $$"""[{"username":"{{first.Username}}"}]""");

        var update = await Client(author.Token).PutAsync($"/v1/ratings/{ratingId}",
            Body($$"""{"companions":[{"username":"{{second.Username}}"}]}"""));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var firstTagged = await ReadJsonAsync(await Client(first.Token).GetAsync($"/v1/users/{first.Username}/tagged"));
        var secondTagged = await ReadJsonAsync(await Client(second.Token).GetAsync($"/v1/users/{second.Username}/tagged"));

        Assert.DoesNotContain(ratingId, RatingIds(firstTagged));
        Assert.Contains(ratingId, RatingIds(secondTagged));
    }

    [SkippableFact]
    public async Task Update_clears_a_field_when_it_is_sent_as_null()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("patch");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Vero", 3, "Tea");

        // A field that is simply absent must survive; one sent as null must go.
        var updated = await ReadJsonAsync(await Client(author.Token).PutAsync(
            $"/v1/ratings/{ratingId}", Body("""{"stars":4.5,"address":null}""")));

        Assert.Equal(4.5, updated.GetProperty("stars").GetDouble());
        Assert.Equal("Tea", updated.GetProperty("drinkName").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, updated.GetProperty("address").ValueKind);
        Assert.NotNull(updated.GetProperty("updatedAt").GetString());
    }

    [SkippableFact]
    public async Task Only_the_owner_can_edit_or_delete()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("owner");
        var other = await RegisterAsync("other");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Vero", 3, "Tea");

        var edit = await Client(other.Token).PutAsync($"/v1/ratings/{ratingId}", Body("""{"stars":1}"""));
        var delete = await Client(other.Token).DeleteAsync($"/v1/ratings/{ratingId}");

        Assert.Equal(HttpStatusCode.Forbidden, edit.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);
    }

    [SkippableFact]
    public async Task Like_toggles_and_the_count_follows()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("liked");
        var fan = await RegisterAsync("fan");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Vero", 4, "Latte");

        var liked = await ReadJsonAsync(await Client(fan.Token).PostAsync($"/v1/ratings/{ratingId}/like", null));
        Assert.True(liked.GetProperty("liked").GetBoolean());
        Assert.Equal(1, liked.GetProperty("likeCount").GetInt32());

        var detail = await ReadJsonAsync(await Client(fan.Token).GetAsync($"/v1/ratings/{ratingId}"));
        Assert.True(detail.GetProperty("isLikedByMe").GetBoolean());
        Assert.Equal(1, detail.GetProperty("rating").GetProperty("likeCount").GetInt32());

        var unliked = await ReadJsonAsync(await Client(fan.Token).PostAsync($"/v1/ratings/{ratingId}/like", null));
        Assert.False(unliked.GetProperty("liked").GetBoolean());
        Assert.Equal(0, unliked.GetProperty("likeCount").GetInt32());
    }

    [SkippableFact]
    public async Task Comment_is_stored_and_counted()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("commented");
        var reader = await RegisterAsync("reader");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Vero", 4, "Latte");

        var created = await Client(reader.Token).PostAsync(
            $"/v1/ratings/{ratingId}/comments", Body("""{"text":"Looks great"}"""));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var detail = await ReadJsonAsync(await Client(author.Token).GetAsync($"/v1/ratings/{ratingId}"));
        var comment = detail.GetProperty("comments").EnumerateArray().Single();

        Assert.Equal("Looks great", comment.GetProperty("text").GetString());
        Assert.Equal(reader.Username, comment.GetProperty("username").GetString());
        Assert.Equal(1, detail.GetProperty("rating").GetProperty("commentCount").GetInt32());
    }

    [SkippableFact]
    public async Task Delete_removes_every_copy_and_restores_the_totals()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("deleter");
        var tagged = await RegisterAsync("tagalong");
        var placeId = $"place_{Guid.NewGuid():N}";

        var ratingId = await CreateRatingAsync(
            author, placeId, "Caffe Nero", 5, "Espresso", 63,
            $$"""[{"username":"{{tagged.Username}}"}]""");

        await Client(tagged.Token).PostAsync($"/v1/ratings/{ratingId}/like", null);
        await Client(tagged.Token).PostAsync($"/v1/ratings/{ratingId}/comments", Body("""{"text":"nice"}"""));

        var before = await ReadJsonAsync(await Client(author.Token).GetAsync("/v1/me"));
        Assert.Equal(63, before.GetProperty("totalCaffeineMg").GetInt32());

        var deleted = await Client(author.Token).DeleteAsync($"/v1/ratings/{ratingId}");
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);

        Assert.Equal(HttpStatusCode.NotFound,
            (await Client(author.Token).GetAsync($"/v1/ratings/{ratingId}")).StatusCode);

        // The likes and comments lived under the same partition and must be gone with it.
        var leftovers = await Fixture.Dynamo.QueryAsync(new QueryRequest
        {
            TableName = Fixture.TableName,
            KeyConditionExpression = "PK = :pk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = new() { S = $"RATING#{ratingId}" },
            },
        });
        Assert.Empty(leftovers.Items);

        var userRatings = await ReadJsonAsync(
            await Client(author.Token).GetAsync($"/v1/users/{author.Username}/ratings"));
        Assert.DoesNotContain(ratingId, RatingIds(userRatings));

        var taggedPage = await ReadJsonAsync(
            await Client(tagged.Token).GetAsync($"/v1/users/{tagged.Username}/tagged"));
        Assert.DoesNotContain(ratingId, RatingIds(taggedPage));

        var after = await ReadJsonAsync(await Client(author.Token).GetAsync("/v1/me"));
        Assert.Equal(0, after.GetProperty("totalCaffeineMg").GetInt32());

        var place = await Client(author.Token).GetAsync($"/v1/places/{placeId}");
        Assert.Equal(0, (await ReadJsonAsync(place)).GetProperty("ratingCount").GetInt32());
    }

    [SkippableFact]
    public async Task Caffeine_stats_count_todays_ratings()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("caffeine");
        await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Vero", 4, "Espresso", 63);
        await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Nero", 4, "Latte", 130);

        var stats = await ReadJsonAsync(
            await Client(author.Token).GetAsync($"/v1/users/{author.Username}/caffeine"));

        Assert.Equal(193, stats.GetProperty("todayMg").GetInt32());
        Assert.Equal(193, stats.GetProperty("totalMg").GetInt32());
    }
}
