using System.Net;
using System.Text;
using System.Text.Json;
using Coffee.Api.Shared.Places;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Coffee.Api.Tests;

/// <summary>
/// The Google Places proxy, against a fake transport. Two things matter here and nothing else does:
/// the request we build is the one the contract promises (paths, headers, session token, primary
/// types, 25 km bias, field mask), and every way Google can let us down comes back as null — a miss,
/// never an exception, because this sits under a type-ahead.
/// </summary>
public class GooglePlacesClientTests
{
    private const string ValidKey = "test-key";
    private const string Session = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

    [Fact]
    public async Task Autocomplete_posts_the_documented_request_and_flattens_the_predictions()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """
            {
              "suggestions": [
                {
                  "placePrediction": {
                    "placeId": "ChIJAAAAAAAAAAAAAAA",
                    "structuredFormat": {
                      "mainText": { "text": "Vero Cafe" },
                      "secondaryText": { "text": "Gedimino pr. 9, Vilnius" }
                    }
                  }
                },
                {
                  "placePrediction": {
                    "placeId": "ChIJBBBBBBBBBBBBBBB",
                    "structuredFormat": {
                      "mainText": { "text": "Caffeine" },
                      "secondaryText": { "text": "Pilies g. 12, Vilnius" }
                    }
                  }
                }
              ]
            }
            """);

        var suggestions = await Client(handler).AutocompleteAsync(
            "Vero", Session, 54.6872, 25.2797, "lt", CancellationToken.None);

        Assert.NotNull(suggestions);
        Assert.Equal(["ChIJAAAAAAAAAAAAAAA", "ChIJBBBBBBBBBBBBBBB"], suggestions.Select(s => s.GooglePlaceId));
        Assert.Equal("Vero Cafe", suggestions[0].Name);
        Assert.Equal("Gedimino pr. 9, Vilnius", suggestions[0].Address);

        var request = Assert.Single(handler.Calls);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://places.googleapis.com/v1/places:autocomplete", request.Url);
        Assert.Equal(ValidKey, request.Header("X-Goog-Api-Key"));

        var body = JsonDocument.Parse(request.Body).RootElement;
        Assert.Equal("Vero", body.GetProperty("input").GetString());
        Assert.Equal(Session, body.GetProperty("sessionToken").GetString());
        Assert.Equal("lt", body.GetProperty("languageCode").GetString());
        Assert.Equal(
            ["cafe", "coffee_shop", "bakery", "restaurant", "bar"],
            body.GetProperty("includedPrimaryTypes").EnumerateArray().Select(t => t.GetString()));

        var circle = body.GetProperty("locationBias").GetProperty("circle");
        Assert.Equal(54.6872, circle.GetProperty("center").GetProperty("latitude").GetDouble(), 4);
        Assert.Equal(25.2797, circle.GetProperty("center").GetProperty("longitude").GetDouble(), 4);
        Assert.Equal(25_000, circle.GetProperty("radius").GetDouble());
    }

    [Fact]
    public async Task Autocomplete_without_coordinates_sends_no_location_bias_or_language()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """{"suggestions":[]}""");

        var suggestions = await Client(handler).AutocompleteAsync(
            "Vero", Session, null, null, null, CancellationToken.None);

        Assert.Empty(suggestions!);
        var body = JsonDocument.Parse(Assert.Single(handler.Calls).Body).RootElement;
        Assert.False(body.TryGetProperty("locationBias", out _));
        Assert.False(body.TryGetProperty("languageCode", out _));
    }

    [Fact]
    public async Task A_prediction_without_a_place_id_is_dropped()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """
            {"suggestions":[{"queryPrediction":{"text":{"text":"coffee"}}},
                            {"placePrediction":{"placeId":"ChIJCCCCCCCCCCCCCCC"}}]}
            """);

        var suggestions = await Client(handler).AutocompleteAsync(
            "coffee", Session, null, null, null, CancellationToken.None);

        var only = Assert.Single(suggestions!);
        Assert.Equal("ChIJCCCCCCCCCCCCCCC", only.GooglePlaceId);
        Assert.Equal(string.Empty, only.Name);
        Assert.Equal(string.Empty, only.Address);
    }

    [Fact]
    public async Task Details_asks_for_the_essentials_field_mask_and_parses_the_place()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """
            {
              "id": "ChIJAAAAAAAAAAAAAAA",
              "displayName": { "text": "Vero Cafe", "languageCode": "lt" },
              "formattedAddress": "Gedimino pr. 9, 01103 Vilnius, Lithuania",
              "location": { "latitude": 54.6872, "longitude": 25.2797 }
            }
            """);

        var details = await Client(handler).GetDetailsAsync(
            "ChIJAAAAAAAAAAAAAAA", Session, "lt", CancellationToken.None);

        Assert.NotNull(details);
        Assert.Equal("Vero Cafe", details.Name);
        Assert.Equal("Gedimino pr. 9, 01103 Vilnius, Lithuania", details.Address);
        Assert.Equal(54.6872, details.Lat, 4);
        Assert.Equal(25.2797, details.Lng, 4);

        var request = Assert.Single(handler.Calls);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal(
            $"https://places.googleapis.com/v1/places/ChIJAAAAAAAAAAAAAAA?sessionToken={Session}&languageCode=lt",
            request.Url);
        Assert.Equal(ValidKey, request.Header("X-Goog-Api-Key"));
        Assert.Equal("id,displayName,formattedAddress,location", request.Header("X-Goog-FieldMask"));
    }

    [Fact]
    public async Task Details_without_a_location_is_a_miss()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """{"id":"x","displayName":{"text":"No Pin"}}""");

        Assert.Null(await Client(handler).GetDetailsAsync(
            "ChIJAAAAAAAAAAAAAAA", Session, null, CancellationToken.None));
    }

    [Fact]
    public async Task An_upstream_403_is_a_miss_not_an_exception()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.Forbidden, """{"error":{"status":"PERMISSION_DENIED"}}""");
        var client = Client(handler);

        Assert.Null(await client.AutocompleteAsync("Vero", Session, null, null, null, CancellationToken.None));
        Assert.Null(await client.GetDetailsAsync("ChIJAAAAAAAAAAAAAAA", Session, null, CancellationToken.None));
    }

    [Fact]
    public async Task A_timeout_is_a_miss()
    {
        // The real 5 s budget would make this test take 5 s; a client-level timeout exercises the same
        // TaskCanceledException path in a millisecond.
        var handler = FakeHandler.Delaying(TimeSpan.FromSeconds(5));
        var http = new HttpClient(handler) { Timeout = TimeSpan.FromMilliseconds(50) };

        Assert.Null(await Client(handler, http).AutocompleteAsync(
            "Vero", Session, null, null, null, CancellationToken.None));
    }

    [Fact]
    public async Task Malformed_json_is_a_miss()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, "{ this is not json");

        Assert.Null(await Client(handler).AutocompleteAsync(
            "Vero", Session, null, null, null, CancellationToken.None));
    }

    [Fact]
    public async Task Without_a_key_the_client_is_unconfigured_and_never_calls_out()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """{"suggestions":[]}""");
        var client = Client(handler, apiKey: "");

        Assert.False(client.IsConfigured);
        Assert.Null(await client.AutocompleteAsync("Vero", Session, null, null, null, CancellationToken.None));
        Assert.Null(await client.GetDetailsAsync("ChIJAAAAAAAAAAAAAAA", Session, null, CancellationToken.None));
        Assert.Empty(handler.Calls);
    }

    private static GooglePlacesClient Client(
        FakeHandler handler, HttpClient? http = null, string apiKey = ValidKey)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Google:PlacesApiKey"] = apiKey })
            .Build();
        return new GooglePlacesClient(http ?? new HttpClient(handler), config, NullLogger<GooglePlacesClient>.Instance);
    }
}

/// <summary>Records what was sent and replays a canned answer — no socket, no Google, no key spent.</summary>
internal sealed class FakeHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _respond;

    private FakeHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) =>
        _respond = respond;

    public List<RecordedCall> Calls { get; } = [];

    public static FakeHandler Returning(HttpStatusCode status, string body) => new((_, _) =>
        Task.FromResult(new HttpResponseMessage(status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        }));

    public static FakeHandler Delaying(TimeSpan delay) => new(async (_, ct) =>
    {
        await Task.Delay(delay, ct);
        return new HttpResponseMessage(HttpStatusCode.OK);
    });

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Calls.Add(new RecordedCall(
            request.Method,
            request.RequestUri!.ToString(),
            request.Headers.ToDictionary(h => h.Key, h => string.Join(",", h.Value), StringComparer.OrdinalIgnoreCase),
            request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(ct)));

        return await _respond(request, ct);
    }
}

internal sealed record RecordedCall(
    HttpMethod Method, string Url, Dictionary<string, string> Headers, string Body)
{
    public string? Header(string name) => Headers.GetValueOrDefault(name);
}
