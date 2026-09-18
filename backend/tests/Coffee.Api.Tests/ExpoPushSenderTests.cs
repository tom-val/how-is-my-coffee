using System.Net;
using System.Text;
using System.Text.Json;
using Coffee.Api.Shared.Push;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Coffee.Api.Tests;

/// <summary>
/// The Expo Push client, against a fake transport. Four things matter: the payload is the one the
/// contract documents, a fan-out larger than Expo's limit goes out in chunks of 100, tokens Expo
/// calls <c>DeviceNotRegistered</c> come back for deletion, and nothing here ever throws — the
/// caller is an endpoint that has already done its real work.
/// </summary>
public class ExpoPushSenderTests
{
    [Fact]
    public async Task Posts_the_documented_payload_to_the_expo_endpoint()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """{"data":[{"status":"ok","id":"x"}]}""");

        var invalid = await Sender(handler).SendAsync(
            [Message("ExponentPushToken[aaa]", "Alice liked your Latte", null, "like", ratingId: "r-1")],
            CancellationToken.None);

        Assert.Empty(invalid);
        var request = Assert.Single(handler.Calls);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://exp.host/--/api/v2/push/send", request.Url);

        var message = JsonDocument.Parse(request.Body).RootElement.EnumerateArray().Single();
        Assert.Equal("ExponentPushToken[aaa]", message.GetProperty("to").GetString());
        Assert.Equal("Alice liked your Latte", message.GetProperty("title").GetString());
        Assert.Equal("default", message.GetProperty("sound").GetString());
        // No body in the contract's copy for `like` — the key is omitted rather than sent as null.
        Assert.False(message.TryGetProperty("body", out _));

        var data = message.GetProperty("data");
        Assert.Equal("like", data.GetProperty("type").GetString());
        Assert.Equal("r-1", data.GetProperty("ratingId").GetString());
        Assert.False(data.TryGetProperty("username", out _));
    }

    [Fact]
    public async Task A_fan_out_larger_than_a_hundred_goes_out_in_chunks_of_a_hundred()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """{"data":[]}""");

        var messages = Enumerable.Range(0, 150)
            .Select(i => Message($"ExponentPushToken[{i}]", "Tomas rated a coffee", "Latte at Vero · 4.5★", "friendRating", ratingId: "r-9"))
            .ToList();

        await Sender(handler).SendAsync(messages, CancellationToken.None);

        Assert.Equal(2, handler.Calls.Count);
        Assert.Equal(100, JsonDocument.Parse(handler.Calls[0].Body).RootElement.GetArrayLength());
        Assert.Equal(50, JsonDocument.Parse(handler.Calls[1].Body).RootElement.GetArrayLength());
    }

    [Fact]
    public async Task The_access_token_header_is_sent_only_when_one_is_configured()
    {
        var withToken = FakeHandler.Returning(HttpStatusCode.OK, """{"data":[]}""");
        await Sender(withToken, accessToken: "expo-secret").SendAsync([Message("ExponentPushToken[a]")], CancellationToken.None);
        Assert.Equal("Bearer expo-secret", Assert.Single(withToken.Calls).Header("Authorization"));

        var without = FakeHandler.Returning(HttpStatusCode.OK, """{"data":[]}""");
        await Sender(without).SendAsync([Message("ExponentPushToken[a]")], CancellationToken.None);
        Assert.Null(Assert.Single(without.Calls).Header("Authorization"));

        var blank = FakeHandler.Returning(HttpStatusCode.OK, """{"data":[]}""");
        await Sender(blank, accessToken: "   ").SendAsync([Message("ExponentPushToken[a]")], CancellationToken.None);
        Assert.Null(Assert.Single(blank.Calls).Header("Authorization"));
    }

    [Fact]
    public async Task Tickets_reporting_DeviceNotRegistered_come_back_as_invalid_tokens()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """
            {
              "data": [
                { "status": "ok", "id": "1" },
                { "status": "error", "message": "…is not a registered push notification recipient",
                  "details": { "error": "DeviceNotRegistered" } },
                { "status": "error", "message": "rate limited", "details": { "error": "MessageRateExceeded" } }
              ]
            }
            """);

        var invalid = await Sender(handler).SendAsync(
            [Message("ExponentPushToken[ok]"), Message("ExponentPushToken[dead]"), Message("ExponentPushToken[busy]")],
            CancellationToken.None);

        // Only the dead device is pruned; a rate-limited message is logged and its token kept.
        Assert.Equal(["ExponentPushToken[dead]"], invalid);
    }

    [Fact]
    public async Task Dead_tokens_are_matched_per_chunk_not_per_batch()
    {
        // One ticket list per request, indexed from zero each time — a sender that kept a running
        // index across chunks would prune the wrong token here.
        var handler = FakeHandler.Responding((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "{\"data\":[" + string.Join(",", Enumerable.Range(0, 100).Select(i =>
                    i == 0
                        ? """{"status":"error","details":{"error":"DeviceNotRegistered"}}"""
                        : """{"status":"ok"}""")) + "]}",
                Encoding.UTF8,
                "application/json"),
        }));

        var messages = Enumerable.Range(0, 150).Select(i => Message($"ExponentPushToken[{i}]")).ToList();
        var invalid = await Sender(handler).SendAsync(messages, CancellationToken.None);

        Assert.Equal(["ExponentPushToken[0]", "ExponentPushToken[100]"], invalid);
    }

    [Fact]
    public async Task An_upstream_error_is_swallowed_rather_than_thrown()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.BadGateway, "upstream exploded");

        Assert.Empty(await Sender(handler).SendAsync([Message("ExponentPushToken[a]")], CancellationToken.None));
        Assert.Single(handler.Calls);
    }

    [Fact]
    public async Task Malformed_json_is_swallowed_rather_than_thrown()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, "{ this is not json");

        Assert.Empty(await Sender(handler).SendAsync([Message("ExponentPushToken[a]")], CancellationToken.None));
    }

    [Fact]
    public async Task A_timeout_is_swallowed_rather_than_thrown()
    {
        // The real 5 s budget would make this test take 5 s; a client-level timeout exercises the
        // same TaskCanceledException path in a millisecond.
        var handler = FakeHandler.Delaying(TimeSpan.FromSeconds(5));
        var http = new HttpClient(handler) { Timeout = TimeSpan.FromMilliseconds(50) };

        Assert.Empty(await Sender(handler, http).SendAsync([Message("ExponentPushToken[a]")], CancellationToken.None));
    }

    [Fact]
    public async Task Sending_nothing_never_touches_the_network()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, """{"data":[]}""");

        Assert.Empty(await Sender(handler).SendAsync([], CancellationToken.None));
        Assert.Empty(handler.Calls);
    }

    private static ExpoPushMessage Message(
        string to, string title = "Title", string? body = null, string type = "like", string? ratingId = null) =>
        new(to, title, body, "default", new ExpoPushData(type, ratingId, null));

    private static ExpoPushSender Sender(FakeHandler handler, HttpClient? http = null, string? accessToken = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Push:AccessToken"] = accessToken })
            .Build();
        return new ExpoPushSender(http ?? new HttpClient(handler), config, NullLogger<ExpoPushSender>.Instance);
    }
}
