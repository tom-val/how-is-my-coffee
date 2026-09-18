using System.Security.Cryptography;
using System.Text;

namespace Coffee.Api.Shared.Auth;

/// <summary>
/// Password hashing with a built-in migration path.
/// <list type="bullet">
///   <item>New hashes: <c>pbkdf2$&lt;iterations&gt;$&lt;saltB64&gt;$&lt;hashB64&gt;</c> (PBKDF2-HMAC-SHA256).</item>
///   <item>Legacy hashes from the Node backend: <c>&lt;saltHex&gt;:&lt;hashHex&gt;</c> (scrypt N=16384 r=8 p=1,
///         64-byte key). They still verify; <see cref="NeedsRehash"/> tells the login endpoint to
///         store a PBKDF2 hash afterwards, so the scrypt path dies out on its own.</item>
/// </list>
/// Note the legacy salt is the hex <i>string</i> — Node passed <c>randomBytes(16).toString('hex')</c>
/// straight into <c>scryptSync</c>, so its UTF-8 bytes (not the decoded 16 bytes) are the salt.
/// </summary>
public static class PasswordHasher
{
    public const int Iterations = 210_000;
    private const int SaltBytes = 16;
    private const int HashBytes = 32;
    private const string Pbkdf2Prefix = "pbkdf2$";

    // Node's scryptSync defaults.
    private const int ScryptN = 16384;
    private const int ScryptR = 8;
    private const int ScryptP = 1;
    private const int ScryptKeyLength = 64;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt, Iterations, HashAlgorithmName.SHA256, HashBytes);
        return $"{Pbkdf2Prefix}{Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string? stored) =>
        !string.IsNullOrWhiteSpace(stored)
        && (stored.StartsWith(Pbkdf2Prefix, StringComparison.Ordinal)
            ? VerifyPbkdf2(password, stored)
            : VerifyLegacyScrypt(password, stored));

    /// <summary>True when the stored hash is an old scrypt one and should be replaced after a successful login.</summary>
    public static bool NeedsRehash(string? stored) =>
        !string.IsNullOrWhiteSpace(stored) && !stored.StartsWith(Pbkdf2Prefix, StringComparison.Ordinal);

    private static bool VerifyPbkdf2(string password, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || !int.TryParse(parts[1], out var iterations) || iterations < 1) return false;

        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password), salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(expected, actual);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static bool VerifyLegacyScrypt(string password, string stored)
    {
        var separator = stored.IndexOf(':', StringComparison.Ordinal);
        if (separator <= 0 || separator == stored.Length - 1) return false;

        var saltHex = stored[..separator];
        var hashHex = stored[(separator + 1)..];

        try
        {
            var expected = Convert.FromHexString(hashHex);
            if (expected.Length != ScryptKeyLength) return false;

            var actual = Scrypt.DeriveKey(
                Encoding.UTF8.GetBytes(password),
                Encoding.UTF8.GetBytes(saltHex),
                ScryptN, ScryptR, ScryptP, ScryptKeyLength);
            return CryptographicOperations.FixedTimeEquals(expected, actual);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
