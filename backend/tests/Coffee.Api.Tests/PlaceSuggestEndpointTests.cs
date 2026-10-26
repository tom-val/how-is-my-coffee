using System.Net;
using System.Net.Http.Headers;
using Coffee.Api.Shared.Auth;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Coffee.Api.Tests;

/// <summary>
/// The place-search proxy with no <c>Google:PlacesApiKey</c> configured — which is how the API runs
/// in CI and on any machine without the local secrets file. Both endpoints must say "unavailable"
/// rather than "failed", because that is the signal the app uses to fall back to Nominatim.
/// These never touch DynamoDB: the token is minted straight from the host's own issuer.
/// </summary>
public class PlaceSuggestEndpointTests(TestAppFactory factory) : IClassFixture<TestAppFactory>
{
    private const string Session = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

    [Theory]
    [InlineData("/v1/places/suggest?q=Vero&session=" + Session)]
    [InlineData("/v1/places/suggest/ChIJAAAAAAAAAAAAAAA?session=" + Session)]
    [InlineData("/v1/places/nearby?lat=54.6811&lng=25.295")]
    public async Task Without_a_key_place_search_is_unavailable(string path)
    {
        var response = await AuthenticatedClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("\"error\":\"place_search_unavailable\"", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/v1/places/suggest?q=Vero")]
    [InlineData("/v1/places/suggest?q=Vero&session=not-a-uuid")]
    public async Task A_missing_or_malformed_session_is_rejected_before_the_key_is_looked_at(string path)
    {
        var response = await AuthenticatedClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("\"error\":\"invalid_session\"", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/v1/places/nearby")]
    [InlineData("/v1/places/nearby?lat=54.68")]
    [InlineData("/v1/places/nearby?lng=25.29")]
    [InlineData("/v1/places/nearby?lat=91&lng=25.29")]
    [InlineData("/v1/places/nearby?lat=54.68&lng=181")]
    public async Task Nearby_needs_both_coordinates_in_range_before_the_key_is_looked_at(string path)
    {
        var response = await AuthenticatedClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("\"error\":\"invalid_location\"", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(54.6811, 25.2950, 54.6811, 25.2950, 0)]
    [InlineData(54.6811, 25.2950, 54.6820, 25.2950, 100)]   // 0.0009° of latitude ≈ 100 m
    [InlineData(54.6872, 25.2797, 54.6834, 25.2893, 748)]   // Cathedral Square → Pilies g.
    public void Distance_is_whole_metres_along_the_ground(
        double lat1, double lng1, double lat2, double lng2, int expected)
    {
        Assert.InRange(Coffee.Api.Features.Places.PlaceEndpoints.DistanceMetres(lat1, lng1, lat2, lng2), expected - 2, expected + 2);
    }

    private HttpClient AuthenticatedClient()
    {
        var token = factory.Services.GetRequiredService<JwtIssuer>().Issue("user-1", "tester");
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
