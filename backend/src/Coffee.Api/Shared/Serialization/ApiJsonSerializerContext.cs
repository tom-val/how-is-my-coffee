using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Coffee.Api.Features.Auth;
using Coffee.Api.Features.Caffeine;
using Coffee.Api.Features.Friends;
using Coffee.Api.Features.Health;
using Coffee.Api.Features.Photos;
using Coffee.Api.Features.Places;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Features.Users;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Caffeine;

namespace Coffee.Api.Shared.Serialization;

/// <summary>
/// Source-generated System.Text.Json metadata for every type that crosses a boundary: the Lambda ↔
/// API-Gateway envelope, every request body, every response DTO, the JWT payload, the pagination
/// cursor and the OpenAI wire shapes.
/// <para>
/// This is mandatory, not an optimisation: Native AOT has no reflection-based serializer, so a type
/// missing from this list fails at runtime (and, for our own code, usually at compile time via
/// SYSLIB1031). Add a <c>[JsonSerializable]</c> whenever you add a DTO.
/// </para>
/// camelCase matches what the old Node backend emitted, so clients see no change.
/// </summary>
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true)]
// Lambda ↔ API Gateway envelope.
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
// Shared shapes + the pagination cursor payload.
[JsonSerializable(typeof(ErrorResponse))]
[JsonSerializable(typeof(StatusResponse))]
[JsonSerializable(typeof(Dictionary<string, string>), TypeInfoPropertyName = "DictionaryStringString")]
[JsonSerializable(typeof(JwtPayload))]
// Health.
[JsonSerializable(typeof(HealthDto))]
// Auth.
[JsonSerializable(typeof(RegisterBody))]
[JsonSerializable(typeof(LoginBody))]
[JsonSerializable(typeof(AuthResponse))]
// Users.
[JsonSerializable(typeof(UserDto))]
[JsonSerializable(typeof(UserListDto))]
[JsonSerializable(typeof(UserPlaceDto))]
[JsonSerializable(typeof(UserPlaceListDto))]
[JsonSerializable(typeof(CaffeineStatsDto))]
// Friends.
[JsonSerializable(typeof(AddFriendBody))]
[JsonSerializable(typeof(FriendDto))]
[JsonSerializable(typeof(FollowerDto))]
[JsonSerializable(typeof(FriendListDto))]
[JsonSerializable(typeof(FollowerListDto))]
// Ratings.
[JsonSerializable(typeof(CompanionDto))]
[JsonSerializable(typeof(CompanionInput))]
[JsonSerializable(typeof(List<CompanionInput>))]
[JsonSerializable(typeof(CreateRatingBody))]
[JsonSerializable(typeof(CreateCommentBody))]
[JsonSerializable(typeof(RatingDto))]
[JsonSerializable(typeof(RatingPage))]
[JsonSerializable(typeof(RatingDetail))]
[JsonSerializable(typeof(LikeDto))]
[JsonSerializable(typeof(CommentDto))]
[JsonSerializable(typeof(LikeToggleDto))]
// Places.
[JsonSerializable(typeof(PlaceDto))]
// Caffeine.
[JsonSerializable(typeof(ResolveCaffeineBody))]
[JsonSerializable(typeof(ResolveCaffeineDto))]
[JsonSerializable(typeof(OpenAiRequest))]
[JsonSerializable(typeof(OpenAiResponse))]
// Photos.
[JsonSerializable(typeof(UploadUrlBody))]
[JsonSerializable(typeof(UploadUrlDto))]
public partial class ApiJsonSerializerContext : JsonSerializerContext;
