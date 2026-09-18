using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Coffee.Api.Tests;

/// <summary>
/// Boots the app with the minimum configuration it needs to start. These smoke tests never reach
/// DynamoDB or S3 — they only exercise the pipeline up to the auth check — but the clients are
/// constructed for any request that injects them, so they are pointed at the local endpoints.
/// </summary>
public sealed class TestAppFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Auth:JwtSecret", "test-secret-value");
        builder.UseSetting("Dynamo:TableName", "CoffeeApp");
        builder.UseSetting("Dynamo:ServiceUrl", "http://localhost:8000");
        builder.UseSetting("Photos:Bucket", "coffee-app-photos");
        builder.UseSetting("Photos:ServiceUrl", "http://localhost:9000");
        builder.UseSetting("Photos:PublicBaseUrl", "http://localhost:9000/coffee-app-photos");
        // appsettings.Local.json (gitignored, a real Google key on a developer machine) is added by
        // Program.cs *after* the host settings, so it would win over UseSetting. Blank the key from a
        // source of our own, appended last, so the suite can never call Google.
        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(
            new Dictionary<string, string?> { ["Google:PlacesApiKey"] = "" }));
    }
}

public class HealthEndpointTests(TestAppFactory factory) : IClassFixture<TestAppFactory>
{
    [Fact]
    public async Task Health_returns_ok()
    {
        var response = await factory.CreateClient().GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"status\":\"ok\"", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/v1/me")]
    [InlineData("/v1/feed")]
    [InlineData("/v1/friends")]
    public async Task Protected_endpoints_answer_401_without_a_token(string path)
    {
        var response = await factory.CreateClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("\"error\":\"unauthorized\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_garbage_token_is_treated_as_no_token()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Authorization", "Bearer not-a-real-token");

        var response = await client.GetAsync("/v1/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
