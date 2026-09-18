using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Shared.Caffeine;

// Wire shapes for the OpenAI chat-completions call. Public because the source-generated
// JsonSerializerContext exposes a JsonTypeInfo property per type.
public sealed record OpenAiMessage(string Role, string Content);

public sealed record OpenAiRequest(
    string Model,
    List<OpenAiMessage> Messages,
    [property: JsonPropertyName("max_completion_tokens")] int MaxCompletionTokens);

public sealed record OpenAiChoiceMessage(string? Content);
public sealed record OpenAiChoice(OpenAiChoiceMessage? Message);
public sealed record OpenAiOutputContent(string? Text);
public sealed record OpenAiOutput(List<OpenAiOutputContent>? Content);
public sealed record OpenAiResponse(List<OpenAiChoice>? Choices, List<OpenAiOutput>? Output);

/// <summary>Fallback estimator for drinks the static table does not know.</summary>
public interface ICaffeineAiResolver
{
    /// <summary>Best-effort estimate in mg, or null on any failure (no key, network, timeout, unparseable).</summary>
    Task<int?> ResolveAsync(string drinkName, CancellationToken ct);
}

/// <summary>
/// Asks GPT-5 mini for a drink's caffeine content. Every failure mode collapses to null on purpose:
/// this sits on a user-facing "what's in my drink?" path, so a flaky third party must degrade to
/// <c>{ caffeineMg: 0, source: "error" }</c> rather than fail the request.
/// </summary>
public sealed class OpenAiCaffeineResolver : ICaffeineAiResolver
{
    private const string Endpoint = "https://api.openai.com/v1/chat/completions";
    private const string Model = "gpt-5-mini";
    private const string SystemPrompt =
        "You are a caffeine content expert. Given a drink name, reply with your best estimate of the "
        + "caffeine content in milligrams for a standard single serving. Reply with ONLY an integer. "
        + "For non-caffeinated drinks reply 0.";

    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    private readonly HttpClient _http;
    private readonly ILogger<OpenAiCaffeineResolver> _logger;
    private readonly string? _apiKey;

    public OpenAiCaffeineResolver(HttpClient http, IConfiguration config, ILogger<OpenAiCaffeineResolver> logger)
    {
        _http = http;
        _logger = logger;
        _apiKey = config["OpenAi:ApiKey"];
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

            var body = new OpenAiRequest(Model,
            [
                new OpenAiMessage("system", SystemPrompt),
                new OpenAiMessage("user", $"How many mg of caffeine in \"{drinkName}\"?"),
            ], 2048);

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

            // gpt-5 models may answer in either the Responses (`output`) or chat (`choices`) shape.
            var text = parsed?.Output?.FirstOrDefault()?.Content?.FirstOrDefault()?.Text
                       ?? parsed?.Choices?.FirstOrDefault()?.Message?.Content;

            if (!int.TryParse(text?.Trim(), out var mg) || mg < 0)
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
}
