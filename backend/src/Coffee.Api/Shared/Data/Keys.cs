namespace Coffee.Api.Shared.Data;

/// <summary>
/// The single-table key design, in one place. The strings are load-bearing: production rows written
/// by the old Node backend must keep resolving, so neither the prefixes nor the attribute names in
/// <see cref="Attr"/> may change.
/// </summary>
public static class Keys
{
    public const string ProfileSk = "PROFILE";
    public const string MetaSk = "META";
    public const string UsernameSk = "USERNAME";

    public const string RatingPrefix = "RATING#";
    public const string PlacePrefix = "PLACE#";
    public const string FriendPrefix = "FRIEND#";
    public const string FollowerPrefix = "FOLLOWER#";
    public const string TaggedPrefix = "TAGGED#";
    public const string LikePrefix = "LIKE#";
    public const string CommentPrefix = "COMMENT#";
    public const string PushPrefix = "PUSH#";

    /// <summary>
    /// <c>BLOCK#&lt;blockedId&gt;</c> (I blocked them) and <c>BLOCKEDBY#&lt;blockerId&gt;</c> (they blocked
    /// me) both start with <see cref="BlockFamilyPrefix"/>, so one query on my partition returns every
    /// user hidden from me in either direction — see <c>Shared/Moderation/BlockList</c>.
    /// </summary>
    public const string BlockPrefix = "BLOCK#";
    public const string BlockedByPrefix = "BLOCKEDBY#";
    public const string BlockFamilyPrefix = "BLOCK";

    /// <summary>Reporter-side idempotency pointer: <c>REPORTED#&lt;targetType&gt;#&lt;targetId&gt;</c> → reportId.</summary>
    public const string ReportedPrefix = "REPORTED#";
    public const string ReportPrefix = "REPORT#";

    /// <summary>GSI1 partition constant for the username prefix search (see <c>GET /v1/users/search</c>).</summary>
    public const string UsernameIndexPk = "USERNAME";

    /// <summary>
    /// GSI1 partition constant for the map / discovery query (see <c>GET /v1/places</c>). Every
    /// <c>PLACE#&lt;id&gt;/META</c> row carries it with <c>GSI1SK = &lt;placeId&gt;</c>, which is what
    /// turns "all cafés anyone has rated" into one query instead of a table scan.
    /// </summary>
    public const string PlaceIndexPk = "PLACE";

    /// <summary>GSI1 partition constant for the moderation queue: every <c>REPORT#&lt;id&gt;/META</c> row
    /// carries it with <c>GSI1SK = &lt;createdAt&gt;</c>, so "newest reports first" is one query.</summary>
    public const string ReportIndexPk = "REPORT";

    public static string User(string userId) => $"USER#{userId}";
    public static string Rating(string ratingId) => $"RATING#{ratingId}";
    public static string Place(string placeId) => $"PLACE#{placeId}";
    public static string UsernameLookup(string username) => $"USERNAME#{username}";
    public static string Report(string reportId) => $"REPORT#{reportId}";

    /// <summary>Sort key of a rating copy on both the USER# and PLACE# partitions.</summary>
    public static string RatingSk(string createdAt, string ratingId) => $"RATING#{createdAt}#{ratingId}";
    public static string TaggedSk(string createdAt, string ratingId) => $"TAGGED#{createdAt}#{ratingId}";
    public static string UserPlaceSk(string placeId) => $"PLACE#{placeId}";
    public static string FriendSk(string friendUserId) => $"FRIEND#{friendUserId}";
    public static string FollowerSk(string followerUserId) => $"FOLLOWER#{followerUserId}";
    public static string LikeSk(string userId) => $"LIKE#{userId}";
    public static string CommentSk(string createdAt, string commentId) => $"COMMENT#{createdAt}#{commentId}";

    /// <summary>One row per registered device; the Expo token is the sort key, so re-registering is an upsert.</summary>
    public static string PushSk(string token) => $"PUSH#{token}";

    public static string BlockSk(string blockedUserId) => $"BLOCK#{blockedUserId}";
    public static string BlockedBySk(string blockerUserId) => $"BLOCKEDBY#{blockerUserId}";
    public static string ReportedSk(string targetType, string targetId) => $"REPORTED#{targetType}#{targetId}";
}

/// <summary>Attribute names as written by the old Node handlers — do not rename.</summary>
public static class Attr
{
    public const string Pk = "PK";
    public const string Sk = "SK";
    public const string Gsi1Pk = "GSI1PK";
    public const string Gsi1Sk = "GSI1SK";
    public const string EntityType = "entityType";

    public const string UserId = "userId";
    public const string Username = "username";
    public const string DisplayName = "displayName";
    public const string PasswordHash = "passwordHash";
    public const string TotalCaffeineMg = "totalCaffeineMg";

    public const string RatingId = "ratingId";
    public const string PlaceId = "placeId";
    public const string PlaceName = "placeName";
    public const string Name = "name";
    public const string Stars = "stars";
    public const string DrinkName = "drinkName";
    public const string Description = "description";
    public const string PhotoKey = "photoKey";
    public const string Lat = "lat";
    public const string Lng = "lng";
    public const string Address = "address";
    public const string CaffeineMg = "caffeineMg";
    public const string LikeCount = "likeCount";
    public const string CommentCount = "commentCount";
    public const string Companions = "companions";
    public const string CreatedAt = "createdAt";
    public const string UpdatedAt = "updatedAt";

    public const string AvgRating = "avgRating";
    public const string RatingCount = "ratingCount";
    public const string LastVisited = "lastVisited";
    public const string VisitCount = "visitCount";

    public const string FriendUserId = "friendUserId";
    public const string FriendUsername = "friendUsername";
    public const string FriendDisplayName = "friendDisplayName";
    public const string AddedAt = "addedAt";
    public const string FollowerUserId = "followerUserId";
    public const string FollowerUsername = "followerUsername";
    public const string FollowerDisplayName = "followerDisplayName";
    public const string FollowedAt = "followedAt";

    public const string Token = "token";
    public const string Platform = "platform";
    public const string LastSeenAt = "lastSeenAt";
    public const string NotificationPrefs = "notificationPrefs";

    public const string AuthorUserId = "authorUserId";
    public const string CommentId = "commentId";
    public const string Text = "text";

    public const string BlockedAt = "blockedAt";

    public const string ReportId = "reportId";
    public const string ReporterUserId = "reporterUserId";
    public const string ReporterUsername = "reporterUsername";
    public const string TargetType = "targetType";
    public const string TargetId = "targetId";
    public const string TargetUserId = "targetUserId";
    public const string TargetUsername = "targetUsername";
    public const string Reason = "reason";
    public const string Details = "details";
    public const string Excerpt = "excerpt";
    public const string Status = "status";
    public const string ResolvedAt = "resolvedAt";
}
