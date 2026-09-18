using System.Net;
using System.Text.Json;
using Coffee.Api.Shared.Caffeine;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Coffee.Api.Tests;

/// <summary>
/// The AI caffeine fallback, against a fake transport: it must call the Responses API with the
/// documented shape (model, zero reasoning effort, no temperature) and read the answer out of the
/// <c>output_text</c> parts — skipping reasoning items — and every failure must come back as null.
/// </summary>
public class OpenAiCaffeineResolverTests
{
    private const string ResponsesBody = """
        {
          "output": [
            { "type": "reasoning", "summary": [] },
            { "type": "message", "content": [ { "type": "output_text", "text": " 63 " } ] }
          ]
        }
        """;

    [Fact]
    public async Task Posts_the_responses_api_request_and_parses_the_integer()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, ResponsesBody);

        var mg = await Resolver(handler).ResolveAsync("espresso", CancellationToken.None);

        Assert.Equal(63, mg);
        var call = Assert.Single(handler.Calls);
        Assert.Equal(HttpMethod.Post, call.Method);
        Assert.Equal("https://api.openai.com/v1/responses", call.Url);
        Assert.Equal("Bearer sk-test", call.Header("Authorization"));

        using var body = JsonDocument.Parse(call.Body);
        var root = body.RootElement;
        Assert.Equal("gpt-5.6-luna", root.GetProperty("model").GetString());
        Assert.Equal("none", root.GetProperty("reasoning").GetProperty("effort").GetString());
        Assert.Contains("espresso", root.GetProperty("input").GetString());
        Assert.True(root.TryGetProperty("max_output_tokens", out _));
        Assert.False(root.TryGetProperty("temperature", out _), "reasoning models reject temperature");
        Assert.False(root.TryGetProperty("messages", out _), "this is the Responses API, not chat completions");
    }

    [Fact]
    public async Task Model_and_effort_come_from_configuration()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, ResponsesBody);

        await Resolver(handler, model: "gpt-6-astra", effort: "low").ResolveAsync("latte", CancellationToken.None);

        using var body = JsonDocument.Parse(Assert.Single(handler.Calls).Body);
        Assert.Equal("gpt-6-astra", body.RootElement.GetProperty("model").GetString());
        Assert.Equal("low", body.RootElement.GetProperty("reasoning").GetProperty("effort").GetString());
    }

    [Fact]
    public async Task No_key_means_no_call_and_null()
    {
        var handler = FakeHandler.Returning(HttpStatusCode.OK, ResponsesBody);

        Assert.Null(await Resolver(handler, apiKey: "").ResolveAsync("espresso", CancellationToken.None));
        Assert.Empty(handler.Calls);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, ResponsesBody)]
    [InlineData(HttpStatusCode.OK, "not json")]
    [InlineData(HttpStatusCode.OK, """{ "output": [ { "type": "message", "content": [ { "type": "output_text", "text": "lots" } ] } ] }""")]
    [InlineData(HttpStatusCode.OK, """{ "output": [ { "type": "message", "content": [ { "type": "output_text", "text": "-5" } ] } ] }""")]
    [InlineData(HttpStatusCode.OK, """{ "output": [] }""")]
    public async Task Any_failure_is_null(HttpStatusCode status, string body)
    {
        var handler = FakeHandler.Returning(status, body);

        Assert.Null(await Resolver(handler).ResolveAsync("mystery drink", CancellationToken.None));
    }

    [Fact]
    public void ExtractOutputText_concatenates_only_output_text_parts()
    {
        var response = new OpenAiResponse(
        [
            new OpenAiOutput("reasoning", null),
            new OpenAiOutput("message",
            [
                new OpenAiOutputContent("refusal", "no"),
                new OpenAiOutputContent("output_text", "1"),
                new OpenAiOutputContent("output_text", "30"),
            ]),
        ]);

        Assert.Equal("130", OpenAiCaffeineResolver.ExtractOutputText(response));
        Assert.Equal(string.Empty, OpenAiCaffeineResolver.ExtractOutputText(null));
    }

    private static OpenAiCaffeineResolver Resolver(
        FakeHandler handler, string apiKey = "sk-test", string? model = null, string? effort = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["OpenAi:ApiKey"] = apiKey,
                ["OpenAi:Model"] = model,
                ["OpenAi:ReasoningEffort"] = effort,
            })
            .Build();
        return new OpenAiCaffeineResolver(new HttpClient(handler), config, NullLogger<OpenAiCaffeineResolver>.Instance);
    }
}
