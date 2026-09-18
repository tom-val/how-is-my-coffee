using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Data;

namespace Coffee.Api.Shared.Push;

/// <summary>
/// The five things worth waking a phone for. The wire names double as the keys of the
/// <c>notificationPrefs</c> map on the profile row and as <c>data.type</c> in the Expo payload, so
/// they are part of the contract — do not rename them.
/// </summary>
public enum NotificationType
{
    /// <summary>Someone tagged you as a companion on their rating.</summary>
    Tagged,

    /// <summary>Someone liked your rating.</summary>
    Like,

    /// <summary>Someone commented on your rating.</summary>
    Comment,

    /// <summary>Someone started following you.</summary>
    Follow,

    /// <summary>Someone you follow posted a new rating.</summary>
    FriendRating,
}

public static class NotificationTypes
{
    public const string Tagged = "tagged";
    public const string Like = "like";
    public const string Comment = "comment";
    public const string Follow = "follow";
    public const string FriendRating = "friendRating";

    /// <summary>Every key a prefs document can carry, in contract order.</summary>
    public static readonly string[] All = [Tagged, Like, Comment, Follow, FriendRating];

    public static string Key(this NotificationType type) => type switch
    {
        NotificationType.Tagged => Tagged,
        NotificationType.Like => Like,
        NotificationType.Comment => Comment,
        NotificationType.Follow => Follow,
        NotificationType.FriendRating => FriendRating,
        _ => throw new ArgumentOutOfRangeException(nameof(type)),
    };
}

/// <summary>
/// Reads and writes the <c>notificationPrefs</c> map attribute on a <c>USER#&lt;id&gt;/PROFILE</c> row.
/// <para>
/// Everything defaults to on, and that default is expressed by <i>absence</i>: a user who never
/// opened Settings has no attribute at all, and an unknown or non-boolean entry reads as true too.
/// That keeps every account written by the old stack working without a migration.
/// </para>
/// </summary>
public static class NotificationPrefs
{
    /// <summary>Whether a profile row (possibly null, possibly without the attribute) allows this type.</summary>
    public static bool Allows(Dictionary<string, AttributeValue>? profile, NotificationType type)
    {
        var map = profile?.Map(Attr.NotificationPrefs);
        return map is null || map.Flag(type.Key()) is not false;
    }

    /// <summary>All five flags, defaults applied — what <c>GET /v1/notification-prefs</c> answers.</summary>
    public static Dictionary<string, bool> Read(Dictionary<string, AttributeValue>? profile)
    {
        var map = profile?.Map(Attr.NotificationPrefs);
        var prefs = new Dictionary<string, bool>(NotificationTypes.All.Length, StringComparer.Ordinal);
        foreach (var key in NotificationTypes.All) prefs[key] = map?.Flag(key) is not false;
        return prefs;
    }

    public static AttributeValue ToAttribute(IReadOnlyDictionary<string, bool> prefs)
    {
        var map = new Dictionary<string, AttributeValue>(prefs.Count);
        foreach (var key in NotificationTypes.All)
        {
            if (prefs.TryGetValue(key, out var enabled)) map[key] = Av.Bool(enabled);
        }
        return Av.M(map);
    }
}
