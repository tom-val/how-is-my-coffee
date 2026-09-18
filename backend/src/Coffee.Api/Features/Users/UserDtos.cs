using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Data;

namespace Coffee.Api.Features.Users;

/// <summary>Public user shape. <c>passwordHash</c> deliberately has no home here.</summary>
public sealed record UserDto(
    string UserId, string Username, string DisplayName, string CreatedAt, int? TotalCaffeineMg);

public sealed record UserListDto(IReadOnlyList<UserDto> Users);

public sealed record UserPlaceDto(
    string PlaceId, string PlaceName, double Lat, double Lng, string? Address, string? LastVisited, int VisitCount);

public sealed record UserPlaceListDto(IReadOnlyList<UserPlaceDto> Places);

public sealed record CaffeineStatsDto(int TodayMg, int TotalMg);

public static class UserMapper
{
    /// <summary>Projects a stored profile item to the public shape — the one place that decides what leaves the server.</summary>
    public static UserDto ToDto(Dictionary<string, AttributeValue> profile)
    {
        var username = profile.StrOr(Attr.Username, string.Empty);
        return new UserDto(
            UserId: profile.StrOr(Attr.UserId, string.Empty),
            Username: username,
            DisplayName: profile.StrOr(Attr.DisplayName, username),
            CreatedAt: profile.StrOr(Attr.CreatedAt, string.Empty),
            TotalCaffeineMg: profile.ContainsKey(Attr.TotalCaffeineMg) ? profile.Int(Attr.TotalCaffeineMg) : null);
    }
}
