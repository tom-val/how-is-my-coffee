namespace Coffee.Api.Features.Ratings;

/// <summary>A person the author drank coffee with: a registered user (ids set) or a free-text guest.</summary>
public sealed record CompanionDto(string? UserId, string? Username, string DisplayName);

/// <summary>The rating shape every list and detail endpoint returns (see docs/api-contract.md).</summary>
public sealed record RatingDto(
    string RatingId,
    string UserId,
    string Username,
    string DisplayName,
    string PlaceId,
    string PlaceName,
    string? Address,
    double Lat,
    double Lng,
    double Stars,
    string DrinkName,
    string? Description,
    string? PhotoKey,
    string? PhotoUrl,
    int CaffeineMg,
    int LikeCount,
    int CommentCount,
    IReadOnlyList<CompanionDto> Companions,
    string CreatedAt,
    string? UpdatedAt);

/// <summary>A cursor-paged list of ratings plus which of them the caller has liked.</summary>
public sealed record RatingPage(
    IReadOnlyList<RatingDto> Ratings,
    IReadOnlyList<string> LikedRatingIds,
    string? NextCursor);

public sealed record LikeDto(string UserId, string Username, string DisplayName);

public sealed record CommentDto(
    string CommentId, string UserId, string Username, string DisplayName, string Text, string CreatedAt);

public sealed record RatingDetail(
    RatingDto Rating, IReadOnlyList<LikeDto> Likes, IReadOnlyList<CommentDto> Comments, bool IsLikedByMe);

public sealed record LikeToggleDto(bool Liked, int LikeCount);

// ── Request bodies ──

/// <summary>A companion as the client sends it: either an existing <c>username</c> or a guest <c>displayName</c>.</summary>
public sealed record CompanionInput(string? Username, string? DisplayName);

public sealed record CreateRatingBody(
    string? PlaceId,
    string? PlaceName,
    double? Stars,
    string? DrinkName,
    string? Description,
    string? PhotoKey,
    double? Lat,
    double? Lng,
    string? Address,
    int? CaffeineMg,
    List<CompanionInput>? Companions);

// The PUT body is deliberately NOT a record: the contract lets a field be sent as null to CLEAR it
// (description, photoKey, address), and a deserialized record cannot tell "absent" from "null".
// RatingEndpoints parses that one body from a JsonDocument instead — see RatingPatch.

public sealed record CreateCommentBody(string? Text);
