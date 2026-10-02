using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Storage;

namespace Coffee.Api.Features.Reports;

/// <summary>One report as the moderation queue shows it. Operator-side only — never serialized.</summary>
public sealed record ReportSummary(
    string ReportId,
    string CreatedAt,
    string Status,
    string TargetType,
    string TargetId,
    string? RatingId,
    string TargetUsername,
    string Reason,
    string ReporterUsername,
    string Excerpt,
    string? Details);

public enum ResolveOutcome
{
    NotFound,
    Resolved,
    AlreadyResolved,
}

/// <summary>
/// The moderator's tools, run from <c>backend/tools/Coffee.Admin</c> (there is no moderation HTTP
/// endpoint). Everything reuses the API's own teardown code — <see cref="RatingStore.DeleteRatingAsync"/>
/// for a rating and <see cref="RatingStore.RemoveReactionAsync"/> for a comment — so a moderator removal
/// leaves exactly the state the owner's own delete would. Every operation is idempotent.
/// </summary>
public sealed class ModerationService(CoffeeDb db, RatingStore ratings, IPhotoStorage? photos)
{
    /// <summary>Newest first, from GSI1 (<c>GSI1PK="REPORT"</c>, <c>GSI1SK=createdAt</c>).</summary>
    public async Task<List<ReportSummary>> ListReportsAsync(bool openOnly, int limit, CancellationToken ct)
    {
        var request = new QueryRequest
        {
            TableName = db.TableName,
            IndexName = "GSI1",
            KeyConditionExpression = "GSI1PK = :pk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue> { [":pk"] = Av.S(Keys.ReportIndexPk) },
            ScanIndexForward = false,
        };
        if (openOnly)
        {
            // `status` is a reserved word, hence the alias.
            request.FilterExpression = "#s = :open";
            request.ExpressionAttributeNames = new Dictionary<string, string> { ["#s"] = Attr.Status };
            request.ExpressionAttributeValues[":open"] = Av.S(ReportEndpoints.StatusOpen);
        }

        var reports = new List<ReportSummary>();
        do
        {
            var page = await db.QueryPageAsync(request, ct);
            reports.AddRange(page.Items.Select(ToSummary));
            request.ExclusiveStartKey = page.LastEvaluatedKey is { Count: > 0 } ? page.LastEvaluatedKey : null;
        }
        while (reports.Count < limit && request.ExclusiveStartKey is not null);

        return [.. reports.Take(limit)];
    }

    /// <summary>Marks a report resolved (keeping the first <c>resolvedAt</c> on a repeat).</summary>
    public async Task<ResolveOutcome> ResolveReportAsync(string reportId, CancellationToken ct)
    {
        try
        {
            var response = await db.Client.UpdateItemAsync(new UpdateItemRequest
            {
                TableName = db.TableName,
                Key = CoffeeDb.Key(Keys.Report(reportId), Keys.MetaSk),
                UpdateExpression = "SET #s = :resolved, resolvedAt = if_not_exists(resolvedAt, :now)",
                ConditionExpression = "attribute_exists(PK)",
                ExpressionAttributeNames = new Dictionary<string, string> { ["#s"] = Attr.Status },
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    [":resolved"] = Av.S(ReportEndpoints.StatusResolved),
                    [":now"] = Av.S(Timestamps.Now()),
                },
                ReturnValues = Amazon.DynamoDBv2.ReturnValue.UPDATED_OLD,
            }, ct);
            return response.Attributes?.Str(Attr.Status) == ReportEndpoints.StatusResolved
                ? ResolveOutcome.AlreadyResolved
                : ResolveOutcome.Resolved;
        }
        catch (ConditionalCheckFailedException)
        {
            return ResolveOutcome.NotFound;
        }
    }

    /// <summary>
    /// Takes a rating down exactly like its author's <c>DELETE /v1/ratings/{id}</c>, plus its photo.
    /// Returns false when there is nothing (left) to remove.
    /// </summary>
    public async Task<(bool Removed, bool PhotoDeleted)> RemoveRatingAsync(string ratingId, CancellationToken ct)
    {
        var meta = await db.GetAsync(Keys.Rating(ratingId), Keys.MetaSk, ct);
        if (meta is null) return (false, false);

        // Hand the teardown the author's USER# copy when it exists: that copy is removed last, so a
        // run that dies half-way still leaves a row to finish from (same reasoning as AccountDeleter).
        var userId = meta.StrOr(Attr.UserId, string.Empty);
        var createdAt = meta.StrOr(Attr.CreatedAt, string.Empty);
        var userCopy = userId.Length > 0 && createdAt.Length > 0
            ? await db.GetAsync(Keys.User(userId), Keys.RatingSk(createdAt, ratingId), ct)
            : null;
        var rating = userCopy ?? meta;

        // Photo first, while the rows still say which object it is. Only the author's own uploads —
        // photoKey is client-supplied (see IPhotoStorage.IsOwnedBy).
        var photoDeleted = false;
        var photoKey = rating.Str(Attr.PhotoKey) ?? meta.Str(Attr.PhotoKey);
        if (photos is not null && IPhotoStorage.IsOwnedBy(photoKey, userId))
        {
            await photos.DeleteAsync(photoKey!, ct);
            photoDeleted = true;
        }

        await ratings.DeleteRatingAsync(rating, ct);
        return (true, photoDeleted);
    }

    /// <summary>Removes one comment and takes it off the rating's <c>commentCount</c> on all three copies.</summary>
    public async Task<bool> RemoveCommentAsync(string ratingId, string commentId, CancellationToken ct)
    {
        var comment = await ratings.FindCommentAsync(ratingId, commentId, ct);
        if (comment is null) return false;

        await ratings.RemoveReactionAsync(ratingId, comment.StrOr(Attr.Sk, string.Empty), Attr.CommentCount, ct);
        return true;
    }

    private static ReportSummary ToSummary(Dictionary<string, AttributeValue> item) => new(
        ReportId: item.StrOr(Attr.ReportId, string.Empty),
        CreatedAt: item.StrOr(Attr.CreatedAt, string.Empty),
        Status: item.StrOr(Attr.Status, string.Empty),
        TargetType: item.StrOr(Attr.TargetType, string.Empty),
        TargetId: item.StrOr(Attr.TargetId, string.Empty),
        RatingId: item.Str(Attr.RatingId),
        TargetUsername: item.StrOr(Attr.TargetUsername, string.Empty),
        Reason: item.StrOr(Attr.Reason, string.Empty),
        ReporterUsername: item.StrOr(Attr.ReporterUsername, string.Empty),
        Excerpt: item.StrOr(Attr.Excerpt, string.Empty),
        Details: item.Str(Attr.Details));
}
