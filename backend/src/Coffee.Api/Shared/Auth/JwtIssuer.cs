using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Shared.Auth;

/// <summary>The JWT payload we mint. camelCase-serialized: <c>sub</c>, <c>username</c>, <c>iat</c>, <c>exp</c>.</summary>
public sealed record JwtPayload(string Sub, string Username, long Iat, long Exp);

/// <summary>
/// Hand-rolled HS256 tokens. The JWT libraries all reach for reflection-based serialization and
/// runtime code generation, which Native AOT forbids — and an HMAC over two base64url segments is
/// small enough to own outright. This API is the only thing that mints or validates these tokens.
/// </summary>
public sealed class JwtIssuer
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);

    private const string HeaderJson = """{"alg":"HS256","typ":"JWT"}""";
    private readonly byte[] _secret;
    private readonly string _encodedHeader;

    public JwtIssuer(IConfiguration config)
    {
        var secret = config["Auth:JwtSecret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            throw new InvalidOperationException(
                "Auth:JwtSecret is not configured (Lambda env var Auth__JwtSecret).");
        }
        _secret = Encoding.UTF8.GetBytes(secret);
        _encodedHeader = Base64UrlEncode(Encoding.UTF8.GetBytes(HeaderJson));
    }

    public string Issue(string userId, string username, DateTimeOffset? now = null)
    {
        var issuedAt = now ?? DateTimeOffset.UtcNow;
        var payload = new JwtPayload(
            userId, username, issuedAt.ToUnixTimeSeconds(), issuedAt.Add(Lifetime).ToUnixTimeSeconds());

        var encodedPayload = Base64UrlEncode(
            JsonSerializer.SerializeToUtf8Bytes(payload, ApiJsonSerializerContext.Default.JwtPayload));
        var signingInput = $"{_encodedHeader}.{encodedPayload}";
        return $"{signingInput}.{Sign(signingInput)}";
    }

    /// <summary>
    /// Validates signature and expiry in constant time. Returns false for anything malformed —
    /// callers never learn <i>why</i> a token was rejected, and neither does an attacker.
    /// </summary>
    public bool TryValidate(string? token, out string userId, out string username)
    {
        userId = string.Empty;
        username = string.Empty;
        if (string.IsNullOrWhiteSpace(token)) return false;

        var parts = token.Split('.');
        if (parts.Length != 3) return false;

        var expected = Sign($"{parts[0]}.{parts[1]}");
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(parts[2])))
        {
            return false;
        }

        try
        {
            var payload = JsonSerializer.Deserialize(
                Base64UrlDecode(parts[1]), ApiJsonSerializerContext.Default.JwtPayload);
            if (payload is null || string.IsNullOrEmpty(payload.Sub)) return false;
            if (payload.Exp <= DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return false;

            userId = payload.Sub;
            username = payload.Username ?? string.Empty;
            return true;
        }
        catch (Exception ex) when (ex is JsonException or FormatException)
        {
            return false;
        }
    }

    private string Sign(string signingInput) =>
        Base64UrlEncode(HMACSHA256.HashData(_secret, Encoding.UTF8.GetBytes(signingInput)));

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        s = (s.Length % 4) switch { 2 => s + "==", 3 => s + "=", _ => s };
        return Convert.FromBase64String(s);
    }
}
