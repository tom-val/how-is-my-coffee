using System.Globalization;
using Coffee.Api.Shared.Data;

namespace Coffee.Api.Shared.Push;

/// <summary>Whoever caused the notification — their name is the subject of every line of copy.</summary>
public sealed record NotificationActor(string UserId, string Username, string DisplayName);

/// <summary>The rating a notification points at, reduced to what the copy and the deep link need.</summary>
public sealed record NotificationRating(string RatingId, string DrinkName, string PlaceName, double Stars);

/// <summary>
/// Turns "this just happened" into Expo messages: it resolves each recipient's preference and
/// devices, writes the English copy from the contract, hands the batch to <see cref="IPushSender"/>
/// and prunes tokens Expo reported as dead.
/// <para>
/// There is no queue. Lambda freezes the execution environment the moment a response is written, so
/// a fire-and-forget send would simply never finish; instead each endpoint <c>await</c>s its
/// notification immediately before returning, and everything here runs inside a
/// <see cref="Budget"/>-long <see cref="CancellationTokenSource"/> with a catch-all around it. A
/// slow or broken Expo therefore costs the caller three seconds at most and changes no status code.
/// </para>
/// <para>
/// <c>Push:Enabled=false</c> makes every method a no-op — that is how the test hosts and a local
/// <c>dotnet run</c> stay off the network.
/// </para>
/// </summary>
public sealed class Notifier(CoffeeDb db, IPushSender sender, IConfiguration config, ILogger<Notifier> logger)
{
    /// <summary>How long an endpoint is willing to wait for the whole fan-out.</summary>
    public static readonly TimeSpan Budget = TimeSpan.FromSeconds(3);

    // Parsed by hand rather than through IConfiguration.GetValue<T>: the binder is reflection-based,
    // and "default to on unless someone explicitly said false" is a one-liner anyway.
    private readonly bool _enabled = !bool.TryParse(config["Push:Enabled"], out var configured) || configured;

    /// <summary>"&lt;Name&gt; had a coffee with you" to each registered companion of a new (or newly edited) rating.</summary>
    public Task TaggedAsync(
        IReadOnlyList<string> recipientUserIds, NotificationActor author, NotificationRating rating, CancellationToken ct) =>
        DispatchAsync(
            NotificationType.Tagged, recipientUserIds, author.UserId,
            title: $"{author.DisplayName} had a coffee with you",
            body: $"{rating.DrinkName} at {rating.PlaceName}",
            ratingId: rating.RatingId, username: null, ct);

    /// <summary>"&lt;Name&gt; liked your &lt;drink&gt;" to the rating's author (never for a like of your own rating).</summary>
    public Task LikeAsync(
        string ratingAuthorId, NotificationActor liker, NotificationRating rating, CancellationToken ct) =>
        DispatchAsync(
            NotificationType.Like, [ratingAuthorId], liker.UserId,
            title: $"{liker.DisplayName} liked your {rating.DrinkName}",
            body: null,
            ratingId: rating.RatingId, username: null, ct);

    /// <summary>"&lt;Name&gt; commented on your &lt;drink&gt;" with the comment itself as the body, trimmed to 120 characters.</summary>
    public Task CommentAsync(
        string ratingAuthorId, NotificationActor commenter, NotificationRating rating, string text, CancellationToken ct) =>
        DispatchAsync(
            NotificationType.Comment, [ratingAuthorId], commenter.UserId,
            title: $"{commenter.DisplayName} commented on your {rating.DrinkName}",
            body: Truncate(text, 120),
            ratingId: rating.RatingId, username: null, ct);

    /// <summary>"&lt;Name&gt; started following you" — the only type whose tap target is a profile.</summary>
    public Task FollowAsync(string followedUserId, NotificationActor follower, CancellationToken ct) =>
        DispatchAsync(
            NotificationType.Follow, [followedUserId], follower.UserId,
            title: $"{follower.DisplayName} started following you",
            body: null,
            ratingId: null, username: follower.Username, ct);

    /// <summary>"&lt;Name&gt; rated a coffee" to everyone following the author of a new rating.</summary>
    public Task FriendRatingAsync(
        IReadOnlyList<string> followerUserIds, NotificationActor author, NotificationRating rating, CancellationToken ct) =>
        DispatchAsync(
            NotificationType.FriendRating, followerUserIds, author.UserId,
            title: $"{author.DisplayName} rated a coffee",
            body: $"{rating.DrinkName} at {rating.PlaceName} · {Stars(rating.Stars)}★",
            ratingId: rating.RatingId, username: null, ct);

    /// <summary>
    /// Everyone following <paramref name="userId"/> — the recipient list for <c>friendRating</c>.
    /// Lives here rather than in the endpoint so that a failure (or a disabled <c>Push:Enabled</c>)
    /// costs the caller nothing: it answers with an empty list instead of throwing.
    /// </summary>
    public async Task<IReadOnlyList<string>> FollowerIdsAsync(string userId, CancellationToken ct)
    {
        if (!_enabled) return [];
        try
        {
            var followers = await db.QueryPrefixAsync(Keys.User(userId), Keys.FollowerPrefix, ct);
            return [.. followers
                .Select(f => f.StrOr(Attr.FollowerUserId, string.Empty))
                .Where(id => id.Length > 0)];
        }
        catch (Exception ex)
        {
            logger.LogWarning("Resolving followers for a push failed: {Reason}", ex.GetType().Name);
            return [];
        }
    }

    /// <summary>
    /// Prefs → devices → Expo → token cleanup, for one message sent to many people. The whole thing
    /// is best-effort: any failure (including the budget running out) is a warning and nothing more.
    /// </summary>
    private async Task DispatchAsync(
        NotificationType type,
        IReadOnlyList<string> recipientUserIds,
        string? excludeUserId,
        string title,
        string? body,
        string? ratingId,
        string? username,
        CancellationToken ct)
    {
        if (!_enabled || recipientUserIds.Count == 0) return;

        var recipients = recipientUserIds
            .Where(id => !string.IsNullOrEmpty(id) && id != excludeUserId)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (recipients.Count == 0) return;

        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(Budget);

        try
        {
            var owners = new Dictionary<string, string>(StringComparer.Ordinal);
            var messages = new List<ExpoPushMessage>();
            var data = new ExpoPushData(type.Key(), ratingId, username);

            foreach (var userId in recipients)
            {
                var profile = await db.GetAsync(
                    Keys.User(userId), Keys.ProfileSk, budget.Token, Attr.UserId, Attr.NotificationPrefs);
                if (!NotificationPrefs.Allows(profile, type)) continue;

                var devices = await db.QueryPrefixAsync(Keys.User(userId), Keys.PushPrefix, budget.Token);
                foreach (var device in devices)
                {
                    var token = device.StrOr(Attr.Token, string.Empty);
                    if (token.Length == 0 || !owners.TryAdd(token, userId)) continue;
                    messages.Add(new ExpoPushMessage(token, title, body, "default", data));
                }
            }

            if (messages.Count == 0) return;

            var invalid = await sender.SendAsync(messages, budget.Token);
            foreach (var token in invalid)
            {
                if (owners.TryGetValue(token, out var owner))
                {
                    await db.DeleteAsync(Keys.User(owner), Keys.PushSk(token), budget.Token);
                }
            }
        }
        catch (Exception ex)
        {
            // Deliberately catch-all: a rating must not fail because a phone could not be reached.
            logger.LogWarning("Push notification '{Type}' failed: {Reason}", type.Key(), ex.GetType().Name);
        }
    }

    private static string Truncate(string text, int max) =>
        text.Length <= max ? text : text[..max];

    /// <summary>4 → "4", 4.5 → "4.5" — never "4,5", whatever the host's culture is.</summary>
    private static string Stars(double stars) => stars.ToString("0.#", CultureInfo.InvariantCulture);
}
