using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Shared.Places;

// Wire shapes for the Google Places API (New). Public because the source-generated
// JsonSerializerContext exposes a JsonTypeInfo property per type. Google speaks camelCase, which is
// exactly what the context emits and reads, so none of these needs a [JsonPropertyName].

public sealed record GoogleLatLng(double Latitude, double Longitude);
public sealed record GoogleCircle(GoogleLatLng Center, double Radius);
public sealed record GoogleLocationBias(GoogleCircle Circle);

public sealed record GoogleAutocompleteRequest(
    string Input,
    string SessionToken,
    string[] IncludedPrimaryTypes,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] GoogleLocationBias? LocationBias,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? LanguageCode);

public sealed record GoogleText(string? Text);
public sealed record GoogleStructuredFormat(GoogleText? MainText, GoogleText? SecondaryText);
public sealed record GooglePlacePrediction(string? PlaceId, GoogleStructuredFormat? StructuredFormat);
public sealed record GoogleSuggestion(GooglePlacePrediction? PlacePrediction);
public sealed record GoogleAutocompleteResponse(List<GoogleSuggestion>? Suggestions);

public sealed record GooglePlaceDetailsResponse(
    string? Id, GoogleText? DisplayName, string? FormattedAddress, GoogleLatLng? Location);

/// <summary>One autocomplete hit, flattened out of Google's nested prediction shape.</summary>
public sealed record GooglePlaceSuggestion(string GooglePlaceId, string Name, string Address);

/// <summary>A resolved place. Google's own id goes no further than the round trip — the app derives
/// <c>place_&lt;snake_case(name)&gt;</c> from the name, exactly as it did with Nominatim.</summary>
public sealed record GooglePlaceDetails(string Name, string Address, double Lat, double Lng);

/// <summary>Server-side proxy for Google place search, so the API key never reaches a phone or a browser.</summary>
public interface IGooglePlacesClient
{
    /// <summary>False when <c>Google:PlacesApiKey</c> is unset. The endpoints then answer 503 and the app
    /// falls back to Nominatim — a different thing from "Google failed", which is 502.</summary>
    bool IsConfigured { get; }

    /// <summary>Autocomplete predictions, or null on any upstream failure.</summary>
    Task<IReadOnlyList<GooglePlaceSuggestion>?> AutocompleteAsync(
        string input, string sessionToken, double? lat, double? lng, string? languageCode, CancellationToken ct);

    /// <summary>Details for one prediction, or null on any upstream failure (a 404 included).</summary>
    Task<GooglePlaceDetails?> GetDetailsAsync(
        string googlePlaceId, string sessionToken, string? languageCode, CancellationToken ct);
}

/// <summary>
/// Talks to Places API (New). Two calls make up one billable session: the keystrokes
/// (<c>places:autocomplete</c>) and the single Place Details lookup that closes it — both carry the
/// same <c>sessionToken</c>, and details asks only for the Essentials field mask.
/// <para>
/// Every failure mode collapses to null on purpose: this sits under a type-ahead, so a flaky third
/// party must degrade to "no suggestions" rather than break the screen. The warnings it logs carry
/// the operation name and the status code only — never the key, the query or the URL.
/// </para>
/// </summary>
public sealed class GooglePlacesClient : IGooglePlacesClient
{
    private const string BaseUrl = "https://places.googleapis.com/v1/";
    private const string DetailsFieldMask = "id,displayName,formattedAddress,location";
    private const double LocationBiasRadiusMetres = 25_000;

    /// <summary>Cafés first, then the other places people log coffee at.</summary>
    private static readonly string[] PrimaryTypes = ["cafe", "coffee_shop", "bakery", "restaurant", "bar"];

    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    private readonly HttpClient _http;
    private readonly ILogger<GooglePlacesClient> _logger;
    private readonly string? _apiKey;

    public GooglePlacesClient(HttpClient http, IConfiguration config, ILogger<GooglePlacesClient> logger)
    {
        _http = http;
        _logger = logger;
        _apiKey = config["Google:PlacesApiKey"];
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            _logger.LogWarning(
                "Google:PlacesApiKey is not set — place search answers 503 and the app falls back to Nominatim.");
        }
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<IReadOnlyList<GooglePlaceSuggestion>?> AutocompleteAsync(
        string input, string sessionToken, double? lat, double? lng, string? languageCode, CancellationToken ct)
    {
        if (!IsConfigured) return null;

        var bias = lat is { } latitude && lng is { } longitude
            ? new GoogleLocationBias(new GoogleCircle(new GoogleLatLng(latitude, longitude), LocationBiasRadiusMetres))
            : null;
        var body = new GoogleAutocompleteRequest(input, sessionToken, PrimaryTypes, bias, languageCode);

        var parsed = await SendAsync("autocomplete", ApiJsonSerializerContext.Default.GoogleAutocompleteResponse, ct,
            () => new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}places:autocomplete")
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(body, ApiJsonSerializerContext.Default.GoogleAutocompleteRequest),
                    Encoding.UTF8,
                    "application/json"),
            });

        if (parsed is null) return null;

        return
        [
            .. (parsed.Suggestions ?? [])
                .Select(s => s.PlacePrediction)
                .Where(p => !string.IsNullOrWhiteSpace(p?.PlaceId))
                .Select(p => new GooglePlaceSuggestion(
                    p!.PlaceId!,
                    p.StructuredFormat?.MainText?.Text ?? string.Empty,
                    p.StructuredFormat?.SecondaryText?.Text ?? string.Empty)),
        ];
    }

    public async Task<GooglePlaceDetails?> GetDetailsAsync(
        string googlePlaceId, string sessionToken, string? languageCode, CancellationToken ct)
    {
        if (!IsConfigured) return null;

        // The endpoint has already checked the id against ^[A-Za-z0-9_-]{10,200}$, so nothing in it can
        // escape the path segment; the query values are escaped regardless.
        var url = $"{BaseUrl}places/{googlePlaceId}?sessionToken={Uri.EscapeDataString(sessionToken)}";
        if (!string.IsNullOrWhiteSpace(languageCode)) url += $"&languageCode={Uri.EscapeDataString(languageCode)}";

        var parsed = await SendAsync("details", ApiJsonSerializerContext.Default.GooglePlaceDetailsResponse, ct, () =>
        {
            var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("X-Goog-FieldMask", DetailsFieldMask);
            return request;
        });

        // No coordinates means nothing the map can pin, so treat it as a miss rather than 0,0.
        if (parsed?.Location is null) return null;

        return new GooglePlaceDetails(
            parsed.DisplayName?.Text ?? string.Empty,
            parsed.FormattedAddress ?? string.Empty,
            parsed.Location.Latitude,
            parsed.Location.Longitude);
    }

    /// <summary>Send, check the status, deserialize — the three ways this integration can fail, each
    /// logged with the operation name and nothing else.</summary>
    private async Task<T?> SendAsync<T>(
        string operation, JsonTypeInfo<T> typeInfo, CancellationToken ct, Func<HttpRequestMessage> buildRequest)
        where T : class
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(Timeout);

            using var request = buildRequest();
            request.Headers.Add("X-Goog-Api-Key", _apiKey);

            using var response = await _http.SendAsync(request, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Google Places {Operation} returned {Status}", operation, (int)response.StatusCode);
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            return await JsonSerializer.DeserializeAsync(stream, typeInfo, timeout.Token);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogWarning("Google Places {Operation} failed: {Reason}", operation, ex.GetType().Name);
            return null;
        }
    }
}
