using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Shared.Caffeine;

// Wire shapes for the OpenAI Responses API call. Public because the source-generated
// JsonSerializerContext exposes a JsonTypeInfo property per type.
public sealed record OpenAiReasoning(string Effort);

public sealed record OpenAiRequest(
    string Model,
    string Instructions,
    string Input,
    OpenAiReasoning Reasoning,
    [property: JsonPropertyName("max_output_tokens")] int MaxOutputTokens);

public sealed record OpenAiOutputContent(string? Type, string? Text);
public sealed record OpenAiOutput(string? Type, List<OpenAiOutputContent>? Content);
public sealed record OpenAiResponse(List<OpenAiOutput>? Output);

/// <summary>Fallback estimator for drinks the static table does not know.</summary>
public interface ICaffeineAiResolver
{
    /// <summary>Best-effort estimate in mg, or null on any failure (no key, network, timeout, unparseable).</summary>
    Task<int?> ResolveAsync(string drinkName, CancellationToken ct);
}

/// <summary>
/// Asks an OpenAI model (default <c>gpt-5.6-luna</c>) for a drink's caffeine content over the
/// Responses API. Every failure mode collapses to null on purpose: this sits on a user-facing
/// "what's in my drink?" path, so a flaky third party must degrade to
/// <c>{ caffeineMg: 0, source: "error" }</c> rather than fail the request.
/// <para>
/// Config: <c>OpenAi:ApiKey</c> (unset ⇒ always null), <c>OpenAi:Model</c>,
/// <c>OpenAi:ReasoningEffort</c> (gpt-5.6-luna accepts none | low | medium | high | xhigh | max;
/// "none" is right for a one-integer answer — a model that rejects it can be switched to "low"
/// without a code change). No <c>temperature</c>: reasoning models reject it.
/// </para>
/// </summary>
public sealed class OpenAiCaffeineResolver : ICaffeineAiResolver
{
    public const string DefaultModel = "gpt-5.6-luna";
    public const string DefaultReasoningEffort = "none";
    private const string Endpoint = "https://api.openai.com/v1/responses";
    private const int MaxOutputTokens = 64; // one integer; the ceiling only bounds a runaway answer
    private const string Instructions =
        "You are a caffeine content expert. Given a drink name, reply with your best estimate of the "
        + "caffeine content in milligrams for a standard single serving. Reply with ONLY an integer. "
        + "For non-caffeinated drinks reply 0.";

    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    private readonly HttpClient _http;
    private readonly ILogger<OpenAiCaffeineResolver> _logger;
    private readonly string? _apiKey;
    private readonly string _model;
    private readonly string _reasoningEffort;

    public OpenAiCaffeineResolver(HttpClient http, IConfiguration config, ILogger<OpenAiCaffeineResolver> logger)
    {
        _http = http;
        _logger = logger;
        _apiKey = config["OpenAi:ApiKey"];
        _model = string.IsNullOrWhiteSpace(config["OpenAi:Model"]) ? DefaultModel : config["OpenAi:Model"]!;
        _reasoningEffort = string.IsNullOrWhiteSpace(config["OpenAi:ReasoningEffort"])
            ? DefaultReasoningEffort
            : config["OpenAi:ReasoningEffort"]!;
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            _logger.LogWarning(
                "OpenAi:ApiKey is not set — unknown drinks will resolve to 0 mg with source=error.");
        }
    }

    public async Task<int?> ResolveAsync(string drinkName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_apiKey)) return null;

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(Timeout);

            var body = new OpenAiRequest(
                _model,
                Instructions,
                $"How many mg of caffeine in \"{drinkName}\"?",
                new OpenAiReasoning(_reasoningEffort),
                MaxOutputTokens);

            using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(body, ApiJsonSerializerContext.Default.OpenAiRequest),
                    Encoding.UTF8,
                    "application/json"),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);

            using var response = await _http.SendAsync(request, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("OpenAI returned {Status} for drink {Drink}", (int)response.StatusCode, drinkName);
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            var parsed = await JsonSerializer.DeserializeAsync(
                stream, ApiJsonSerializerContext.Default.OpenAiResponse, timeout.Token);

            var text = ExtractOutputText(parsed);
            if (!int.TryParse(text, out var mg) || mg < 0)
            {
                _logger.LogWarning("OpenAI gave an unparseable answer for {Drink}: {Text}", drinkName, text);
                return null;
            }
            return mg;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogWarning(ex, "OpenAI caffeine lookup failed for {Drink}", drinkName);
            return null;
        }
    }

    /// <summary>
    /// The plain text of a Responses API result. The raw API has no <c>output_text</c> field (that is
    /// an SDK convenience): walk <c>output[]</c> and concatenate every <c>output_text</c> part of the
    /// message items, skipping <c>reasoning</c> items, which carry no content for us.
    /// </summary>
    internal static string ExtractOutputText(OpenAiResponse? response)
    {
        if (response?.Output is null) return string.Empty;
        var sb = new StringBuilder();
        foreach (var item in response.Output)
        {
            if (item.Content is null) continue;
            foreach (var part in item.Content)
            {
                if (part.Type == "output_text" && part.Text is not null) sb.Append(part.Text);
            }
        }
        return sb.ToString().Trim();
    }
}
