using System.Collections.Concurrent;
using Coffee.Api.Shared.Push;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// Test double for <see cref="IPushSender"/> — records the messages the notifier built instead of
/// calling Expo, so a test can assert exactly who would have been woken up, with what copy and with
/// which deep-link payload.
/// </summary>
public sealed class CapturingPushSender : IPushSender
{
    private readonly ConcurrentQueue<ExpoPushMessage> _messages = new();

    /// <summary>Tokens the next send should report as <c>DeviceNotRegistered</c>.</summary>
    public HashSet<string> DeadTokens { get; } = new(StringComparer.Ordinal);

    public IReadOnlyList<ExpoPushMessage> Messages => [.. _messages];

    public Task<IReadOnlyList<string>> SendAsync(IReadOnlyList<ExpoPushMessage> messages, CancellationToken ct)
    {
        foreach (var message in messages) _messages.Enqueue(message);
        return Task.FromResult<IReadOnlyList<string>>(
            [.. messages.Select(m => m.To).Where(DeadTokens.Contains)]);
    }

    public void Reset()
    {
        _messages.Clear();
        DeadTokens.Clear();
    }

    /// <summary>Every message of one notification type, in the order the notifier produced them.</summary>
    public IReadOnlyList<ExpoPushMessage> OfType(string type) =>
        [.. _messages.Where(m => m.Data.Type == type)];

    /// <summary>The devices a given type was addressed to.</summary>
    public IReadOnlyList<string> RecipientsOf(string type) => [.. OfType(type).Select(m => m.To)];
}
