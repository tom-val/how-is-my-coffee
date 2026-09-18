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

    private HttpClient AuthenticatedClient()
    {
        var token = factory.Services.GetRequiredService<JwtIssuer>().Issue("user-1", "tester");
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
