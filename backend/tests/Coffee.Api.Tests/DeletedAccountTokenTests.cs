using System.Net;
using System.Net.Http.Headers;
using Coffee.Api.Shared.Auth;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Coffee.Api.Tests;

/// <summary>
/// A token stays cryptographically valid for 30 days after its account is deleted. The auth
/// middleware must turn it into "no user" before any endpoint sees it, so every protected route
/// answers the contract's 401 — including the ones that never load the profile themselves.
/// No DynamoDB: the lookup is the factory's in-memory stub and the 401 happens before any data access.
/// </summary>
public class DeletedAccountTokenTests(TestAppFactory factory) : IClassFixture<TestAppFactory>
{
    [Theory]
    [InlineData("GET", "/v1/me")]
    [InlineData("GET", "/v1/feed")]
    [InlineData("GET", "/v1/friends")]
    [InlineData("GET", "/v1/followers")]
    [InlineData("GET", "/v1/notification-prefs")]
    [InlineData("GET", "/v1/places?bbox=25,54,26,55")]
    [InlineData("GET", "/v1/places/suggest?q=Vero&session=3f2504e0-4f89-11d3-9a0c-0305e82c3301")]
    [InlineData("GET", "/v1/users/search?q=to")]
    [InlineData("POST", "/v1/ratings")]
    [InlineData("POST", "/v1/ratings/some-rating/like")]
    [InlineData("POST", "/v1/ratings/some-rating/comments")]
    [InlineData("POST", "/v1/friends")]
    [InlineData("PUT", "/v1/push/tokens")]
    [InlineData("POST", "/v1/photos/upload-url")]
    [InlineData("DELETE", "/v1/me")]
    public async Task A_deleted_users_token_is_refused_everywhere(string method, string path)
    {
        var userId = $"deleted-{Guid.NewGuid():N}";
        factory.Accounts.Deleted[userId] = true;
        var token = factory.Services.GetRequiredService<JwtIssuer>().Issue(userId, "ghost");

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method is "POST" or "PUT" or "DELETE")
            request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("\"error\":\"unauthorized\"", await response.Content.ReadAsStringAsync());
    }
}
