using System.Net;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// The content filter on every write that carries free text others will see: sign-up (username,
/// display name), ratings (drink, notes, guest companions; create and edit) and comments. The word
/// list itself is unit-tested in Coffee.Api.Tests; this pins down where it is applied.
/// </summary>
public class ContentFilterTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    [SkippableTheory]
    [InlineData("cunt_lord", "Fine name")]
    [InlineData("fine_name_cf", "Kurva Petras")]
    public async Task Registration_rejects_objectionable_names(string username, string displayName)
    {
        RequireInfrastructure();

        var response = await Client().PostAsync("/v1/auth/register",
            Body($$"""{"username":"{{username}}","displayName":"{{displayName}}","password":"coffee123"}"""));

        await AssertObjectionableAsync(response);
        // Nothing was reserved: the username is still free.
        Assert.Equal(HttpStatusCode.NotFound, (await Client().GetAsync($"/v1/users/{username}")).StatusCode);
    }

    [SkippableTheory]
    [InlineData("""
        "drinkName": "Motherfucker latte"
        """)]
    [InlineData("""
        "drinkName": "Latte", "description": "barista is a whore"
        """)]
    [InlineData("""
        "drinkName": "Latte", "companions": [{"displayName":"Pyderas Jonas"}]
        """)]
    public async Task Creating_a_rating_rejects_objectionable_text(string fields)
    {
        RequireInfrastructure();
        var author = await RegisterAsync("cfrate");

        var response = await Client(author.Token).PostAsync("/v1/ratings", Body($$"""
            {
              "placeId": "place_{{Guid.NewGuid():N}}", "placeName": "Cafe", "stars": 3,
              "lat": 54.6872, "lng": 25.2797, {{fields}}
            }
            """));

        await AssertObjectionableAsync(response);
        Assert.Empty(RatingIds(await ReadJsonAsync(await Client().GetAsync($"/v1/users/{author.Username}/ratings"))));
    }

    [SkippableTheory]
    [InlineData("""{"drinkName":"cunt"}""")]
    [InlineData("""{"description":"eik nachui"}""")]
    [InlineData("""{"companions":[{"displayName":"slut"}]}""")]
    public async Task Editing_a_rating_rejects_objectionable_text(string patch)
    {
        RequireInfrastructure();
        var author = await RegisterAsync("cfedit");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Cafe", 3, "Latte");

        await AssertObjectionableAsync(await Client(author.Token).PutAsync($"/v1/ratings/{ratingId}", Body(patch)));

        var detail = await ReadJsonAsync(await Client(author.Token).GetAsync($"/v1/ratings/{ratingId}"));
        Assert.Equal("Latte", detail.GetProperty("rating").GetProperty("drinkName").GetString());
    }

    [SkippableFact]
    public async Task Comments_are_filtered_but_ordinary_text_and_near_misses_pass()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("cfcom");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Scunthorpe", 3, "Cocktail");

        await AssertObjectionableAsync(await Client(author.Token).PostAsync(
            $"/v1/ratings/{ratingId}/comments", Body("""{"text":"fuck you"}""")));

        var fine = await Client(author.Token).PostAsync(
            $"/v1/ratings/{ratingId}/comments", Body("""{"text":"Scunthorpe has a classic cocktail bar"}"""));
        Assert.Equal(HttpStatusCode.Created, fine.StatusCode);

        var detail = await ReadJsonAsync(await Client(author.Token).GetAsync($"/v1/ratings/{ratingId}"));
        Assert.Equal(1, detail.GetProperty("comments").GetArrayLength());
    }

    private static async Task AssertObjectionableAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("objectionable_content", (await ReadJsonAsync(response)).GetProperty("error").GetString());
    }
}
