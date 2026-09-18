using System.Globalization;

namespace Coffee.Api.Shared.Data;

/// <summary>
/// Timestamps are stored as ISO-8601 UTC strings with milliseconds — the exact format
/// <c>Date.prototype.toISOString()</c> produced. Sort keys are built by concatenating them, so the
/// fixed width matters: drop the milliseconds and the lexicographic order stops matching time order.
/// </summary>
public static class Timestamps
{
    public const string Format = "yyyy-MM-ddTHH:mm:ss.fffZ";

    public static string Now() => From(DateTimeOffset.UtcNow);

    public static string From(DateTimeOffset moment) =>
        moment.UtcDateTime.ToString(Format, CultureInfo.InvariantCulture);

    /// <summary>The <c>yyyy-MM-dd</c> prefix used to bound "today's" ratings in a sort-key range query.</summary>
    public static string TodayPrefix() => DateTimeOffset.UtcNow.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
