using Amazon.S3;
using Amazon.S3.Model;

namespace Coffee.Api.Shared.Storage;

/// <summary>
/// Photo uploads. Clients never stream bytes through the API: they ask for a short-lived presigned
/// PUT, upload straight to S3 (MinIO locally), and then hand the resulting key back as
/// <c>photoKey</c>. Reads go through <see cref="PhotoUrl"/>, which is the CloudFront
/// <c>/uploads/*</c> behaviour in production and the MinIO bucket URL in dev.
/// </summary>
public interface IPhotoStorage
{
    /// <summary>Server-generated key: <c>uploads/&lt;userId&gt;/&lt;uuid&gt;.&lt;ext&gt;</c> — the client never picks it.</summary>
    string BuildKey(string userId, string fileName);

    /// <summary>Presigned PUT, valid 5 minutes.</summary>
    string PresignPut(string key, string contentType);

    /// <summary>Absolute, publicly loadable URL for a stored key. Null in, null out.</summary>
    string? PhotoUrl(string? key);

    /// <summary>Removes an object. Idempotent: a key that is already gone is not an error.</summary>
    Task DeleteAsync(string key, CancellationToken ct);

    /// <summary>
    /// True when <paramref name="key"/> is one of <paramref name="userId"/>'s own uploads
    /// (<c>uploads/&lt;userId&gt;/…</c>, the only shape <see cref="BuildKey"/> and the old Node stack
    /// ever produced). <c>photoKey</c> is client-supplied, so anything that deletes objects must check
    /// this first — otherwise a rating pointing at someone else's photo could take it down with it.
    /// </summary>
    static bool IsOwnedBy(string? key, string userId) =>
        !string.IsNullOrWhiteSpace(key)
        && userId.Length > 0
        && key.StartsWith($"uploads/{userId}/", StringComparison.Ordinal)
        && !key.Contains("..", StringComparison.Ordinal);
}

public sealed class S3PhotoStorage(IAmazonS3 s3, IConfiguration config) : IPhotoStorage
{
    private static readonly TimeSpan PutTtl = TimeSpan.FromMinutes(5);

    private readonly string _bucket =
        config["Photos:Bucket"] ?? throw new InvalidOperationException("Photos:Bucket is not configured.");

    // Prefix for readable URLs: the CloudFront origin in prod, the MinIO bucket URL in dev.
    private readonly string _publicBaseUrl = (config["Photos:PublicBaseUrl"] ?? string.Empty).TrimEnd('/');

    // The SDK always presigns https, but MinIO locally speaks http only. SigV4 does not sign the
    // scheme, so rewriting it leaves the signature valid. Never true in production (no ServiceUrl).
    private readonly bool _forceHttp =
        (config["Photos:ServiceUrl"] ?? string.Empty).StartsWith("http://", StringComparison.OrdinalIgnoreCase);

    public string BuildKey(string userId, string fileName)
    {
        var dot = fileName.LastIndexOf('.');
        var ext = dot > 0 && dot < fileName.Length - 1 ? fileName[(dot + 1)..] : "jpg";
        // Keep the extension to a sane, path-safe token — it ends up in a public URL.
        ext = new string(ext.Where(char.IsLetterOrDigit).Take(10).ToArray()).ToLowerInvariant();
        if (ext.Length == 0) ext = "jpg";
        return $"uploads/{userId}/{Guid.NewGuid():D}.{ext}";
    }

    public string PresignPut(string key, string contentType)
    {
        var url = s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = _bucket,
            Key = key,
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.Add(PutTtl),
            ContentType = contentType,
        });
        return _forceHttp ? url.Replace("https://", "http://", StringComparison.Ordinal) : url;
    }

    public string? PhotoUrl(string? key) =>
        string.IsNullOrWhiteSpace(key) ? null : $"{_publicBaseUrl}/{key.TrimStart('/')}";

    public async Task DeleteAsync(string key, CancellationToken ct)
    {
        try
        {
            // S3 answers 204 for a missing key anyway; the catch is for stores (and MinIO versions)
            // that report it as 404 instead.
            await s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = _bucket, Key = key }, ct);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Already gone — exactly the state we wanted.
        }
    }
}
