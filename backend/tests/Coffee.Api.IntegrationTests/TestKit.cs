using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// Shared plumbing for the integration suite: a client per identity, raw-JSON request bodies and
/// <see cref="JsonElement"/> assertions. Requests are written as literal JSON on purpose — these
/// tests are the last line of defence for the wire contract, so they should not share the API's own
/// DTOs (a renamed property would then quietly rename itself on both sides).
/// </summary>
[Collection(IntegrationCollection.Name)]
public abstract class IntegrationTestBase(IntegrationFixture fixture)
{
    protected IntegrationFixture Fixture { get; } = fixture;

    protected void RequireInfrastructure() => Skip.If(Fixture.SkipReason is not null, Fixture.SkipReason);

    protected HttpClient Client(string? token = null)
    {
        var client = Fixture.CreateClient();
        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }

    protected static StringContent Body(string json) => new(json, Encoding.UTF8, "application/json");

    protected static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(text).RootElement.Clone();
    }

    /// <summary>A brand-new account. Usernames are salted so tests never collide inside one table.</summary>
    protected async Task<TestUser> RegisterAsync(string prefix)
    {
        var username = $"{prefix}_{Guid.NewGuid():N}"[..20];
        var response = await Client().PostAsync("/v1/auth/register",
            Body($$"""{"username":"{{username}}","displayName":"{{prefix}} tester","password":"coffee123"}"""));

        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        var json = await ReadJsonAsync(response);
        return new TestUser(
            json.GetProperty("token").GetString()!,
            json.GetProperty("user").GetProperty("userId").GetString()!,
            json.GetProperty("user").GetProperty("username").GetString()!);
    }

    /// <summary>Creates a rating and returns its id. The coordinates default to Vilnius old town; the
    /// map tests override them so each one owns its own corner of the world.</summary>
    protected async Task<string> CreateRatingAsync(
        TestUser author, string placeId, string placeName, double stars, string drinkName,
        int caffeineMg = 0, string companionsJson = "[]", double lat = 54.6872, double lng = 25.2797)
    {
        var response = await Client(author.Token).PostAsync("/v1/ratings", Body($$"""
            {
              "placeId": "{{placeId}}", "placeName": "{{placeName}}",
              "stars": {{Number(stars)}},
              "drinkName": "{{drinkName}}", "caffeineMg": {{caffeineMg}},
              "lat": {{Number(lat)}}, "lng": {{Number(lng)}}, "address": "Gedimino pr. 9",
              "companions": {{companionsJson}}
            }
            """));

        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return (await ReadJsonAsync(response)).GetProperty("ratingId").GetString()!;
    }

    /// <summary>JSON numbers are culture-free; a Lithuanian dev machine would otherwise emit "4,5".</summary>
    protected static string Number(double value) =>
        value.ToString(System.Globalization.CultureInfo.InvariantCulture);

    protected static IEnumerable<string> RatingIds(JsonElement page) =>
        page.GetProperty("ratings").EnumerateArray().Select(r => r.GetProperty("ratingId").GetString()!);
}

public sealed record TestUser(string Token, string UserId, string Username);
