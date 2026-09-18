using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Xunit;

namespace Coffee.Api.IntegrationTests;

public class PlaceAndSearchTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    /// <summary>
    /// The rule that keeps a regular from dominating a café's score: only each user's most recent
    /// rating there counts.
    /// </summary>
    [SkippableFact]
    public async Task Place_stats_use_the_latest_rating_per_user()
    {
        RequireInfrastructure();
        var regular = await RegisterAsync("regular");
        var visitor = await RegisterAsync("visitor");
        var placeId = $"place_{Guid.NewGuid():N}";

        await CreateRatingAsync(regular, placeId, "Caffe Nero", 1, "Espresso");
        await CreateRatingAsync(regular, placeId, "Caffe Nero", 5, "Espresso"); // supersedes the first
        await CreateRatingAsync(visitor, placeId, "Caffe Nero", 4, "Latte");

        var place = await ReadJsonAsync(await Client(regular.Token).GetAsync($"/v1/places/{placeId}"));

        Assert.Equal(2, place.GetProperty("ratingCount").GetInt32());
        Assert.Equal(4.5, place.GetProperty("avgRating").GetDouble());
        Assert.Equal("Caffe Nero", place.GetProperty("name").GetString());
    }

    [SkippableFact]
    public async Task Place_ratings_carry_the_place_fields_and_the_author()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("placer");
        var placeId = $"place_{Guid.NewGuid():N}";
        var ratingId = await CreateRatingAsync(author, placeId, "Caffe Nero", 4, "Latte");

        var page = await ReadJsonAsync(await Client(author.Token).GetAsync($"/v1/places/{placeId}/ratings"));
        var rating = page.GetProperty("ratings").EnumerateArray()
            .Single(r => r.GetProperty("ratingId").GetString() == ratingId);

        Assert.Equal(placeId, rating.GetProperty("placeId").GetString());
        Assert.Equal("Caffe Nero", rating.GetProperty("placeName").GetString());
        Assert.Equal(author.Username, rating.GetProperty("username").GetString());
        Assert.False(string.IsNullOrEmpty(rating.GetProperty("displayName").GetString()));
    }

    [SkippableFact]
    public async Task Rating_a_place_adds_it_to_the_users_places()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("visits");
        var placeId = $"place_{Guid.NewGuid():N}";
        await CreateRatingAsync(author, placeId, "Vero Cafe", 4, "Latte");
        await CreateRatingAsync(author, placeId, "Vero Cafe", 3, "Tea");

        var places = await ReadJsonAsync(await Client(author.Token).GetAsync($"/v1/users/{author.Username}/places"));
        var place = places.GetProperty("places").EnumerateArray()
            .Single(p => p.GetProperty("placeId").GetString() == placeId);

        Assert.Equal("Vero Cafe", place.GetProperty("placeName").GetString());
        Assert.Equal(2, place.GetProperty("visitCount").GetInt32());
    }

    [SkippableFact]
    public async Task Username_search_matches_a_prefix()
    {
        RequireInfrastructure();
        var searcher = await RegisterAsync("searcher");
        var target = await RegisterAsync("findme");

        var results = await ReadJsonAsync(
            await Client(searcher.Token).GetAsync($"/v1/users/search?q={target.Username[..6]}"));
        var usernames = results.GetProperty("users").EnumerateArray()
            .Select(u => u.GetProperty("username").GetString()).ToList();

        Assert.Contains(target.Username, usernames);
    }

    [SkippableFact]
    public async Task Username_search_needs_at_least_two_characters()
    {
        RequireInfrastructure();
        var searcher = await RegisterAsync("shortq");

        var results = await ReadJsonAsync(await Client(searcher.Token).GetAsync("/v1/users/search?q=a"));

        Assert.Empty(results.GetProperty("users").EnumerateArray());
    }

    [SkippableFact]
    public async Task Public_profile_and_ratings_need_no_token()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("publicp");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Vero", 4, "Latte");

        var profile = await Client().GetAsync($"/v1/users/{author.Username}");
        var ratings = await Client().GetAsync($"/v1/users/{author.Username}/ratings");

        Assert.Equal(HttpStatusCode.OK, profile.StatusCode);
        Assert.Equal(HttpStatusCode.OK, ratings.StatusCode);

        var page = await ReadJsonAsync(ratings);
        Assert.Contains(ratingId, RatingIds(page));
        // No token, so nothing can be "liked by me".
        Assert.Empty(page.GetProperty("likedRatingIds").EnumerateArray());
    }

    /// <summary>The presigned PUT has to work end to end, or photos silently never upload.</summary>
    [SkippableFact]
    public async Task Presigned_upload_accepts_a_real_put()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("uploader");

        var response = await Client(author.Token).PostAsync("/v1/photos/upload-url",
            Body("""{"fileName":"latte.jpg","contentType":"image/jpeg"}"""));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await ReadJsonAsync(response);
        var uploadUrl = json.GetProperty("uploadUrl").GetString()!;
        var key = json.GetProperty("key").GetString()!;

        Assert.StartsWith($"uploads/{author.UserId}/", key, StringComparison.Ordinal);
        Assert.EndsWith(".jpg", key, StringComparison.Ordinal);
        Assert.Contains(key, json.GetProperty("photoUrl").GetString()!, StringComparison.Ordinal);

        using var raw = new HttpClient();
        var content = new ByteArrayContent(Encoding.UTF8.GetBytes("not really a jpeg"));
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        var put = await raw.PutAsync(uploadUrl, content);

        Assert.True(put.IsSuccessStatusCode, $"MinIO rejected the presigned PUT: {put.StatusCode}");
    }

    [SkippableFact]
    public async Task Upload_url_rejects_non_images()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("badtype");

        var response = await Client(author.Token).PostAsync("/v1/photos/upload-url",
            Body("""{"fileName":"payload.exe","contentType":"application/octet-stream"}"""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [SkippableFact]
    public async Task Caffeine_resolution_uses_the_static_table_first()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("caffres");

        var response = await Client(user.Token).PostAsync("/v1/drinks/resolve-caffeine",
            Body("""{"drinkName":"Double Espresso"}"""));
        var json = await ReadJsonAsync(response);

        Assert.Equal(126, json.GetProperty("caffeineMg").GetInt32());
        Assert.Equal("table", json.GetProperty("source").GetString());
    }
}
