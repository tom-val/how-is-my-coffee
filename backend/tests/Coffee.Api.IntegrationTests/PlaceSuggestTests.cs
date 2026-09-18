using System.Net;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// <c>GET /v1/places/suggest</c> and <c>/v1/places/suggest/{googlePlaceId}</c> — the Google Places
/// proxy, seen from the wire. The fixture blanks <c>Google:PlacesApiKey</c>, so nothing here reaches
/// Google: what is under test is the guard rail in front of it (auth, validation, routing) and the
/// 503 that tells the app to fall back to Nominatim.
/// </summary>
public class PlaceSuggestTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    private const string Session = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    private const string GoogleId = "ChIJm2aQfBiR3UYRUjLCgQTUBEs";

    [SkippableTheory]
    [InlineData("/v1/places/suggest?q=Vero&session=" + Session)]
    [InlineData("/v1/places/suggest/" + GoogleId + "?session=" + Session)]
    public async Task Place_search_needs_a_token(string path)
    {
        RequireInfrastructure();

        var response = await Client().GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("\"error\":\"unauthorized\"", await response.Content.ReadAsStringAsync());
    }

    [SkippableTheory]
    [InlineData("/v1/places/suggest?q=Vero&session=" + Session)]
    [InlineData("/v1/places/suggest?q=V&session=" + Session)]
    [InlineData("/v1/places/suggest/" + GoogleId + "?session=" + Session)]
    public async Task Without_a_configured_key_both_endpoints_answer_503(string path)
    {
        RequireInfrastructure();
        var user = await RegisterAsync("sugg503");

        var response = await Client(user.Token).GetAsync(path);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("place_search_unavailable", (await ReadJsonAsync(response)).GetProperty("error").GetString());
    }

    [SkippableTheory]
    [InlineData("/v1/places/suggest?q=Vero", "invalid_session")]
    [InlineData("/v1/places/suggest?q=Vero&session=", "invalid_session")]
    [InlineData("/v1/places/suggest?q=Vero&session=12345", "invalid_session")]
    [InlineData("/v1/places/suggest/" + GoogleId, "invalid_session")]
    [InlineData("/v1/places/suggest/" + GoogleId + "?session=nope", "invalid_session")]
    [InlineData("/v1/places/suggest/short?session=" + Session, "invalid_place_id")]
    [InlineData("/v1/places/suggest/has.a.dot.in.it?session=" + Session, "invalid_place_id")]
    public async Task A_malformed_request_is_a_400_with_a_code_the_app_can_map(string path, string error)
    {
        RequireInfrastructure();
        var user = await RegisterAsync("sugg400");

        var response = await Client(user.Token).GetAsync(path);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(error, (await ReadJsonAsync(response)).GetProperty("error").GetString());
    }

    [SkippableTheory]
    [InlineData("lat=54.6872")]
    [InlineData("lng=25.2797")]
    [InlineData("lat=91&lng=25.2797")]
    [InlineData("lat=54.6872&lng=181")]
    public async Task Coordinates_come_in_pairs_and_stay_in_range(string coordinates)
    {
        RequireInfrastructure();
        var user = await RegisterAsync("sugggeo");

        var response = await Client(user.Token).GetAsync($"/v1/places/suggest?q=Vero&session={Session}&{coordinates}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_location", (await ReadJsonAsync(response)).GetProperty("error").GetString());
    }

    /// <summary>
    /// The one thing route ordering could silently break: <c>/v1/places/{placeId}</c> swallowing
    /// <c>/v1/places/suggest/…</c>, or the other way round. A 503 proves the proxy answered (the key is
    /// blank here) and a 404 <c>place_not_found</c> proves the place lookup did.
    /// </summary>
    [SkippableFact]
    public async Task Suggest_and_place_detail_do_not_shadow_each_other()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("suggroute");

        var suggest = await Client(user.Token).GetAsync($"/v1/places/suggest/{GoogleId}?session={Session}");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, suggest.StatusCode);
        Assert.Equal("place_search_unavailable", (await ReadJsonAsync(suggest)).GetProperty("error").GetString());

        var detail = await Client(user.Token).GetAsync("/v1/places/place_x");
        Assert.Equal(HttpStatusCode.NotFound, detail.StatusCode);
        Assert.Equal("place_not_found", (await ReadJsonAsync(detail)).GetProperty("error").GetString());

        // And the two-segment suggest route is still its own endpoint, not a place called "suggest".
        var list = await Client(user.Token).GetAsync($"/v1/places/suggest?q=Vero&session={Session}");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, list.StatusCode);
    }
}
