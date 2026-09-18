using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Serialization;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Photos;

public sealed record UploadUrlBody(string? FileName, string? ContentType);
public sealed record UploadUrlDto(string UploadUrl, string Key, string PhotoUrl);

public static class PhotoEndpoints
{
    public static IEndpointRouteBuilder MapPhotoEndpoints(this IEndpointRouteBuilder app)
    {
        // The client uploads the bytes itself against this presigned PUT — a Lambda is the wrong
        // place to proxy a photo. The key is server-generated and namespaced by user, so a client
        // cannot write over somebody else's object.
        app.MapPost("/v1/photos/upload-url", (
            UploadUrlBody body, AuthContext auth, IPhotoStorage photos) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var fileName = (body.FileName ?? string.Empty).Trim();
            var contentType = (body.ContentType ?? string.Empty).Trim();
            if (fileName.Length == 0) return ApiResults.BadRequest("fileName is required");
            if (!contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return ApiResults.BadRequest("contentType must be an image/* type");

            var key = photos.BuildKey(userId, fileName);
            return Results.Json(
                new UploadUrlDto(photos.PresignPut(key, contentType), key, photos.PhotoUrl(key)!),
                ApiJsonSerializerContext.Default.UploadUrlDto);
        });

        return app;
    }
}
