using System.Net;
using Xunit;

namespace Coffee.Api.IntegrationTests;

public class FeedTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    /// <summary>
    /// The feed's three sources at once: my own rating, a rating by somebody I follow, and a rating
    /// I was tagged in by a stranger.
    /// </summary>
    [SkippableFact]
    public async Task Feed_merges_own_followed_and_tagged_ratings()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("feedauth");
        var follower = await RegisterAsync("feedfoll");
        var taggee = await RegisterAsync("feedtag");

        var follow = await Client(follower.Token).PostAsync("/v1/friends",
            Body($$"""{"friendUsername":"{{author.Username}}"}"""));
        Assert.Equal(HttpStatusCode.Created, follow.StatusCode);

        var ratingId = await CreateRatingAsync(
            author, $"place_{Guid.NewGuid():N}", "Caffe Nero", 4.5, "Flat White", 130,
            $$"""[{"username":"{{taggee.Username}}"}]""");

        foreach (var viewer in (TestUser[])[author, follower, taggee])
        {
            var feed = await ReadJsonAsync(await Client(viewer.Token).GetAsync("/v1/feed"));
            Assert.Contains(ratingId, RatingIds(feed));
        }

        // A stranger sees nothing of it.
        var stranger = await RegisterAsync("feedstr");
        var strangerFeed = await ReadJsonAsync(await Client(stranger.Token).GetAsync("/v1/feed"));
        Assert.DoesNotContain(ratingId, RatingIds(strangerFeed));
    }

    [SkippableFact]
    public async Task Feed_hydrates_the_author_not_the_tagged_user()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("hydauth");
        var taggee = await RegisterAsync("hydtag");

        var ratingId = await CreateRatingAsync(
            author, $"place_{Guid.NewGuid():N}", "Vero", 4, "Latte", 130,
            $$"""[{"username":"{{taggee.Username}}"}]""");

        var feed = await ReadJsonAsync(await Client(taggee.Token).GetAsync("/v1/feed"));
        var rating = feed.GetProperty("ratings").EnumerateArray()
            .Single(r => r.GetProperty("ratingId").GetString() == ratingId);

        Assert.Equal(author.UserId, rating.GetProperty("userId").GetString());
        Assert.Equal(author.Username, rating.GetProperty("username").GetString());
        Assert.False(string.IsNullOrEmpty(rating.GetProperty("displayName").GetString()));
    }

    [SkippableFact]
    public async Task Feed_deduplicates_a_rating_reachable_from_two_sources()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("dedupa");
        var friend = await RegisterAsync("dedupf");
        await Client(author.Token).PostAsync("/v1/friends", Body($$"""{"friendUsername":"{{friend.Username}}"}"""));

        // Written by someone the viewer follows AND tagging the viewer.
        var ratingId = await CreateRatingAsync(
            friend, $"place_{Guid.NewGuid():N}", "Vero", 4, "Latte", 130,
            $$"""[{"username":"{{author.Username}}"}]""");

        var feed = await ReadJsonAsync(await Client(author.Token).GetAsync("/v1/feed"));

        Assert.Single(RatingIds(feed), id => id == ratingId);
    }

    [SkippableFact]
    public async Task Feed_pages_with_its_cursor()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("pager");
        var placeId = $"place_{Guid.NewGuid():N}";
        for (var i = 0; i < 3; i++)
        {
            await CreateRatingAsync(author, placeId, "Vero", 4, $"Drink {i}");
        }

        var first = await ReadJsonAsync(await Client(author.Token).GetAsync("/v1/feed?limit=2"));
        Assert.Equal(2, first.GetProperty("ratings").GetArrayLength());

        var cursor = first.GetProperty("nextCursor").GetString();
        Assert.False(string.IsNullOrEmpty(cursor));

        var second = await ReadJsonAsync(await Client(author.Token).GetAsync($"/v1/feed?limit=2&cursor={cursor}"));
        Assert.Equal(1, second.GetProperty("ratings").GetArrayLength());
        Assert.Empty(RatingIds(first).Intersect(RatingIds(second)));
    }

    [SkippableFact]
    public async Task Unfollowing_removes_the_ratings_from_the_feed()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("unfa");
        var follower = await RegisterAsync("unff");
        await Client(follower.Token).PostAsync("/v1/friends", Body($$"""{"friendUsername":"{{author.Username}}"}"""));

        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Vero", 4, "Latte");
        Assert.Contains(ratingId, RatingIds(await ReadJsonAsync(await Client(follower.Token).GetAsync("/v1/feed"))));

        var unfollow = await Client(follower.Token).DeleteAsync($"/v1/friends/{author.UserId}");
        Assert.Equal(HttpStatusCode.OK, unfollow.StatusCode);

        Assert.DoesNotContain(ratingId, RatingIds(await ReadJsonAsync(await Client(follower.Token).GetAsync("/v1/feed"))));
    }
}
