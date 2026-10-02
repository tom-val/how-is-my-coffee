using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Push;
using Coffee.Api.Shared.Serialization;

namespace Coffee.Api.Features.Reports;

public sealed record ReportBody(string? TargetType, string? TargetId, string? RatingId, string? Reason, string? Details);
public sealed record ReportCreatedDto(string ReportId);

/// <summary>
/// <c>POST /v1/reports</c> — flag a rating, a comment or a user for the moderators (App Store 1.2).
/// <para>
/// Storage is the report itself (<c>REPORT#&lt;id&gt;/META</c>, on GSI1 under <c>"REPORT"</c> by
/// <c>createdAt</c> — the moderation queue <c>Coffee.Admin list-reports</c> reads) plus a pointer on
/// the reporter's partition, <c>REPORTED#&lt;targetType&gt;#&lt;targetId&gt;</c>, holding the reportId.
/// The pointer is what makes a re-report idempotent while the first one is still open; once a
/// moderator resolves it, reporting the same thing again opens a new one.
/// </para>
/// </summary>
public static class ReportEndpoints
{
    public const int MaxDetails = 500;
    public const int MaxExcerpt = 200;

    public const string StatusOpen = "open";
    public const string StatusResolved = "resolved";

    public static readonly string[] TargetTypes = ["rating", "comment", "user"];
    public static readonly string[] Reasons = ["spam", "offensive", "harassment", "other"];

    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/v1/reports", async (
            ReportBody body, AuthContext auth, CoffeeDb db, RatingStore store, Notifier notifier,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            if (!auth.TryRequireUser(out var userId, out var failure)) return failure;

            var targetType = (body.TargetType ?? string.Empty).Trim();
            var targetId = (body.TargetId ?? string.Empty).Trim();
            var reason = (body.Reason ?? string.Empty).Trim();
            var details = string.IsNullOrWhiteSpace(body.Details) ? null : body.Details.Trim();
            var ratingId = string.IsNullOrWhiteSpace(body.RatingId) ? null : body.RatingId.Trim();

            if (!TargetTypes.Contains(targetType)) return ApiResults.BadRequest("invalid_target_type");
            if (targetId.Length == 0) return ApiResults.BadRequest("targetId is required");
            if (!Reasons.Contains(reason)) return ApiResults.BadRequest("invalid_reason");
            if (details is { Length: > MaxDetails })
                return ApiResults.BadRequest($"details must be at most {MaxDetails} characters");
            if (targetType == "comment" && ratingId is null)
                return ApiResults.BadRequest("ratingId is required for comments");

            var target = await ResolveTargetAsync(db, store, targetType, targetId, ratingId, ct);
            if (target is null) return ApiResults.NotFound("not_found");
            if (target.UserId == userId) return ApiResults.BadRequest("cannot_report_self");

            // Idempotency: an open report from this reporter on this target is answered again.
            var pointerSk = Keys.ReportedSk(targetType, targetId);
            var pointer = await db.GetAsync(Keys.User(userId), pointerSk, ct, Attr.ReportId);
            var previousId = pointer?.Str(Attr.ReportId);
            if (previousId is not null && await IsOpenAsync(db, previousId, ct))
                return Existing(previousId);

            var (reporterUsername, _) = await db.IdentityAsync(userId, ct);
            var reportId = Guid.NewGuid().ToString("D");
            var createdAt = Timestamps.Now();

            var report = new Dictionary<string, AttributeValue>
            {
                [Attr.Pk] = Av.S(Keys.Report(reportId)),
                [Attr.Sk] = Av.S(Keys.MetaSk),
                [Attr.ReportId] = Av.S(reportId),
                [Attr.ReporterUserId] = Av.S(userId),
                [Attr.ReporterUsername] = Av.S(reporterUsername),
                [Attr.TargetType] = Av.S(targetType),
                [Attr.TargetId] = Av.S(targetId),
                [Attr.TargetUserId] = Av.S(target.UserId),
                [Attr.TargetUsername] = Av.S(target.Username),
                [Attr.Reason] = Av.S(reason),
                [Attr.Excerpt] = Av.S(target.Excerpt),
                [Attr.Status] = Av.S(StatusOpen),
                [Attr.CreatedAt] = Av.S(createdAt),
                [Attr.EntityType] = Av.S("Report"),
                [Attr.Gsi1Pk] = Av.S(Keys.ReportIndexPk),
                [Attr.Gsi1Sk] = Av.S(createdAt),
            };
            report.PutIfPresent(Attr.RatingId, target.RatingId);
            report.PutIfPresent(Attr.Details, details);

            // Report + pointer in one transaction. The pointer write is conditional on nobody else
            // having opened a report for this pair in the meantime (a double-tap), in which case the
            // winner's id is answered.
            var pointerPut = new Put
            {
                TableName = db.TableName,
                Item = new Dictionary<string, AttributeValue>
                {
                    [Attr.Pk] = Av.S(Keys.User(userId)),
                    [Attr.Sk] = Av.S(pointerSk),
                    [Attr.ReportId] = Av.S(reportId),
                    [Attr.TargetType] = Av.S(targetType),
                    [Attr.TargetId] = Av.S(targetId),
                    [Attr.CreatedAt] = Av.S(createdAt),
                    [Attr.EntityType] = Av.S("Reported"),
                },
                ConditionExpression = previousId is null
                    ? "attribute_not_exists(PK)"
                    : "attribute_not_exists(PK) OR reportId = :previous",
                ExpressionAttributeValues = previousId is null
                    ? null
                    : new Dictionary<string, AttributeValue> { [":previous"] = Av.S(previousId) },
            };

            try
            {
                await db.TransactWriteAsync([db.PutTransact(report), new TransactWriteItem { Put = pointerPut }], ct);
            }
            catch (TransactionCanceledException)
            {
                var winner = (await db.GetAsync(Keys.User(userId), pointerSk, ct, Attr.ReportId))?.Str(Attr.ReportId);
                if (winner is not null) return Existing(winner);
                throw;
            }

            loggers.CreateLogger(typeof(ReportEndpoints)).LogInformation(
                "Report {ReportId}: {TargetType} {TargetId} by {TargetUserId}, reason {Reason}",
                reportId, targetType, targetId, target.UserId, reason);

            await notifier.ReportAsync(
                new ModerationReport(reportId, targetType, reason, target.Username, target.Excerpt, target.RatingId), ct);

            return Results.Json(
                new ReportCreatedDto(reportId),
                ApiJsonSerializerContext.Default.ReportCreatedDto,
                statusCode: StatusCodes.Status201Created);
        });

        return app;
    }

    private static IResult Existing(string reportId) =>
        Results.Json(new ReportCreatedDto(reportId), ApiJsonSerializerContext.Default.ReportCreatedDto);

    private static async Task<bool> IsOpenAsync(CoffeeDb db, string reportId, CancellationToken ct)
    {
        // No projection: `status` is a DynamoDB reserved word, and the row is small anyway.
        var existing = await db.GetAsync(Keys.Report(reportId), Keys.MetaSk, ct);
        return existing?.Str(Attr.Status) == StatusOpen;
    }

    /// <summary>The reported thing's owner and the text the moderator needs to see.</summary>
    private sealed record ReportTarget(string UserId, string Username, string Excerpt, string? RatingId);

    private static async Task<ReportTarget?> ResolveTargetAsync(
        CoffeeDb db, RatingStore store, string targetType, string targetId, string? ratingId, CancellationToken ct)
    {
        switch (targetType)
        {
            case "rating":
                {
                    var meta = await db.GetAsync(Keys.Rating(targetId), Keys.MetaSk, ct);
                    if (meta is null) return null;
                    var ownerId = meta.StrOr(Attr.UserId, string.Empty);
                    var (username, _) = await db.IdentityAsync(ownerId, ct);
                    var drink = meta.StrOr(Attr.DrinkName, string.Empty);
                    var notes = meta.Str(Attr.Description);
                    var excerpt = string.IsNullOrWhiteSpace(notes) ? drink : $"{drink}: {notes}";
                    return new ReportTarget(
                        ownerId, Fallback(username, meta.StrOr(Attr.Username, string.Empty)), Excerpt(excerpt), targetId);
                }
            case "comment":
                {
                    var comment = await store.FindCommentAsync(ratingId!, targetId, ct);
                    if (comment is null) return null;
                    return new ReportTarget(
                        comment.StrOr(Attr.UserId, string.Empty),
                        comment.StrOr(Attr.Username, string.Empty),
                        Excerpt(comment.StrOr(Attr.Text, string.Empty)),
                        ratingId);
                }
            default:
                {
                    var profile = await db.ProfileAsync(targetId, ct);
                    if (profile is null) return null;
                    var username = profile.StrOr(Attr.Username, string.Empty);
                    return new ReportTarget(
                        targetId, username, Excerpt(profile.StrOr(Attr.DisplayName, username)), RatingId: null);
                }
        }
    }

    private static string Fallback(string value, string fallback) => value.Length > 0 ? value : fallback;

    internal static string Excerpt(string text)
    {
        var trimmed = text.Trim();
        return trimmed.Length <= MaxExcerpt ? trimmed : trimmed[..MaxExcerpt];
    }
}
