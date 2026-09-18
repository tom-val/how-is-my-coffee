using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Shared.Push;

// Expo push wire shapes. Public because the source-generated JsonSerializerContext exposes a
// JsonTypeInfo property per type; Expo speaks camelCase, which is what the context emits.

/// <summary>The <c>data</c> blob the app reads to pick a tap target: <c>ratingId</c> → <c>/rating/&lt;id&gt;</c>,
/// else <c>username</c> → <c>/u/&lt;username&gt;</c>.</summary>
public sealed record ExpoPushData(
    string Type,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? RatingId,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Username);

/// <summary>One message for one device. <c>body</c> is omitted where the contract's copy is a title only.</summary>
public sealed record ExpoPushMessage(
    string To,
    string Title,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Body,
    string Sound,
    ExpoPushData Data);

public sealed record ExpoTicketDetails(string? Error);
public sealed record ExpoTicket(string? Status, string? Message, ExpoTicketDetails? Details);
public sealed record ExpoPushResponse(List<ExpoTicket>? Data);

/// <summary>
/// Hands a batch of messages to Expo and reports back the tokens Expo says are dead, so the caller
/// can delete their rows. Never throws: a push is the least important thing an endpoint does.
/// </summary>
public interface IPushSender
{
    /// <summary>Sends everything (chunked) and returns the tokens Expo rejected as
    /// <c>DeviceNotRegistered</c>. An empty list means "nothing to clean up", including after a failure.</summary>
    Task<IReadOnlyList<string>> SendAsync(IReadOnlyList<ExpoPushMessage> messages, CancellationToken ct);
}

/// <summary>
/// The Expo Push API client. Same shape as <c>Shared/Places/GooglePlacesClient</c>: one long-lived
/// <see cref="HttpClient"/>, its own timeout, and every failure degrades to "nothing sent" with a
/// warning rather than an exception — the caller is an endpoint that has already done its real work.
/// <para>
/// Expo caps a request at 100 messages, so a large fan-out goes out as several POSTs. The reply
/// carries one ticket per message in order; a ticket whose <c>details.error</c> is
/// <c>DeviceNotRegistered</c> means the app was uninstalled or the token rotated, and that token is
/// returned for deletion. Other ticket errors (bad APNs/FCM credentials, rate limits) are logged —
/// they would otherwise be completely invisible.
/// </para>
/// </summary>
public sealed class ExpoPushSender : IPushSender
{
    public const string Endpoint = "https://exp.host/--/api/v2/push/send";

    /// <summary>Expo's documented maximum messages per request.</summary>
    public const int ChunkSize = 100;

    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    private const string DeviceNotRegistered = "DeviceNotRegistered";

    private readonly HttpClient _http;
    private readonly ILogger<ExpoPushSender> _logger;
    private readonly string? _accessToken;

    public ExpoPushSender(HttpClient http, IConfiguration config, ILogger<ExpoPushSender> logger)
    {
        _http = http;
        _logger = logger;
        _accessToken = config["Push:AccessToken"];
    }

    public async Task<IReadOnlyList<string>> SendAsync(IReadOnlyList<ExpoPushMessage> messages, CancellationToken ct)
    {
        if (messages.Count == 0) return [];

        var invalid = new List<string>();
        foreach (var chunk in messages.Chunk(ChunkSize))
        {
            var tickets = await PostChunkAsync(chunk, ct);
            if (tickets is null) continue;

            // Tickets come back positionally. A short (or absent) list is not worth failing over —
            // we simply learn nothing about the messages it does not cover.
            for (var i = 0; i < tickets.Count && i < chunk.Length; i++)
            {
                var ticket = tickets[i];
                if (ticket is null || !string.Equals(ticket.Status, "error", StringComparison.Ordinal)) continue;

                if (string.Equals(ticket.Details?.Error, DeviceNotRegistered, StringComparison.Ordinal))
                {
                    invalid.Add(chunk[i].To);
                }
                else
                {
                    _logger.LogWarning(
                        "Expo rejected a push message: {Error}", ticket.Details?.Error ?? ticket.Message ?? "unknown");
                }
            }
            // One line per chunk so CloudWatch shows that a send happened at all (the sends are
            // otherwise silent on success, and a device that never receives anything is hard to debug).
            _logger.LogInformation("Expo push: {Count} message(s) sent, {Invalid} dead token(s)",
                chunk.Length, invalid.Count);
        }
        return invalid;
    }

    private async Task<List<ExpoTicket>?> PostChunkAsync(ExpoPushMessage[] chunk, CancellationToken ct)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(Timeout);

            using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(
                        [.. chunk], ApiJsonSerializerContext.Default.ListExpoPushMessage),
                    Encoding.UTF8,
                    "application/json"),
            };
            // Optional: an Expo access token only matters for accounts with "enhanced security"
            // enabled, and sending an empty header would be rejected outright.
            if (!string.IsNullOrWhiteSpace(_accessToken))
            {
                request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {_accessToken}");
            }

            using var response = await _http.SendAsync(request, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Expo push returned {Status} for {Count} message(s)",
                    (int)response.StatusCode, chunk.Length);
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            var parsed = await JsonSerializer.DeserializeAsync(
                stream, ApiJsonSerializerContext.Default.ExpoPushResponse, timeout.Token);
            return parsed?.Data;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException or JsonException)
        {
            _logger.LogWarning("Expo push failed: {Reason}", ex.GetType().Name);
            return null;
        }
    }
}
