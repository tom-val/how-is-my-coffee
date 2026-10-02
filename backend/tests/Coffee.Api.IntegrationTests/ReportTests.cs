using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Amazon.DynamoDBv2.Model;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Features.Reports;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// Reports (App Store 1.2): <c>POST /v1/reports</c> for each target type, its idempotency and its
/// refusals, the moderator push, and the operator side (<see cref="ModerationService"/>, which is
/// what <c>Coffee.Admin</c> runs).
/// </summary>
public class ReportTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    [SkippableFact]
    public async Task Each_target_type_can_be_reported_and_is_stored_for_the_queue()
    {
        RequireInfrastructure();
        var reporter = await RegisterAsync("reporter");
        var author = await RegisterAsync("rauthor");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Cafe", 2, "Latte");
        await Client(author.Token).PutAsync($"/v1/ratings/{ratingId}", Body("""{"description":"burnt and bitter"}"""));
        var commentId = await CommentAsync(author, ratingId, "a comment worth reporting");

        // Rating: excerpt is drink + notes.
        var rating = await ReportAsync(reporter, $$"""{"targetType":"rating","targetId":"{{ratingId}}","reason":"spam","details":"ad"}""");
        Assert.Equal(HttpStatusCode.Created, rating.StatusCode);
        var ratingRow = await ReportRowAsync((await ReadJsonAsync(rating)).GetProperty("reportId").GetString()!);
        Assert.Equal("rating", ratingRow["targetType"].S);
        Assert.Equal(ratingId, ratingRow["targetId"].S);
        Assert.Equal(ratingId, ratingRow["ratingId"].S);
        Assert.Equal(author.UserId, ratingRow["targetUserId"].S);
        Assert.Equal(author.Username, ratingRow["targetUsername"].S);
        Assert.Equal(reporter.UserId, ratingRow["reporterUserId"].S);
        Assert.Equal(reporter.Username, ratingRow["reporterUsername"].S);
        Assert.Equal("spam", ratingRow["reason"].S);
        Assert.Equal("ad", ratingRow["details"].S);
        Assert.Equal("Latte: burnt and bitter", ratingRow["excerpt"].S);
        Assert.Equal("open", ratingRow["status"].S);
        Assert.Equal("REPORT", ratingRow["GSI1PK"].S);
        Assert.Equal(ratingRow["createdAt"].S, ratingRow["GSI1SK"].S);
        Assert.Equal(ratingRow["reportId"].S, (await RowAsync($"USER#{reporter.UserId}", $"REPORTED#rating#{ratingId}"))!["reportId"].S);

        // Comment: needs ratingId; excerpt is the text.
        var comment = await ReportAsync(reporter,
            $$"""{"targetType":"comment","targetId":"{{commentId}}","ratingId":"{{ratingId}}","reason":"harassment"}""");
        Assert.Equal(HttpStatusCode.Created, comment.StatusCode);
        var commentRow = await ReportRowAsync((await ReadJsonAsync(comment)).GetProperty("reportId").GetString()!);
        Assert.Equal("a comment worth reporting", commentRow["excerpt"].S);
        Assert.Equal(ratingId, commentRow["ratingId"].S);
        Assert.False(commentRow.ContainsKey("details"));

        // User: excerpt is the display name, capped at 200 characters in general.
        var user = await ReportAsync(reporter,
            $$"""{"targetType":"user","targetId":"{{author.UserId}}","reason":"other","details":"{{new string('x', 500)}}"}""");
        Assert.Equal(HttpStatusCode.Created, user.StatusCode);
        var userRow = await ReportRowAsync((await ReadJsonAsync(user)).GetProperty("reportId").GetString()!);
        Assert.Equal("rauthor tester", userRow["excerpt"].S);
        Assert.False(userRow.ContainsKey("ratingId"));
    }

    [SkippableFact]
    public async Task Long_text_is_cut_to_a_200_character_excerpt()
    {
        RequireInfrastructure();
        var reporter = await RegisterAsync("rlong");
        var author = await RegisterAsync("rlonga");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Cafe", 2, "Latte");
        var commentId = await CommentAsync(author, ratingId, new string('w', 450));

        var response = await ReportAsync(reporter,
            $$"""{"targetType":"comment","targetId":"{{commentId}}","ratingId":"{{ratingId}}","reason":"spam"}""");

        var row = await ReportRowAsync((await ReadJsonAsync(response)).GetProperty("reportId").GetString()!);
        Assert.Equal(200, row["excerpt"].S.Length);
    }

    [SkippableFact]
    public async Task Re_reporting_an_open_report_is_idempotent_and_a_resolved_one_opens_a_new_report()
    {
        RequireInfrastructure();
        var reporter = await RegisterAsync("ridem");
        var author = await RegisterAsync("ridema");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Cafe", 2, "Latte");
        var body = $$"""{"targetType":"rating","targetId":"{{ratingId}}","reason":"offensive"}""";

        var first = await ReportAsync(reporter, body);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var firstId = (await ReadJsonAsync(first)).GetProperty("reportId").GetString();

        var second = await ReportAsync(reporter, body.Replace("offensive", "spam"));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(firstId, (await ReadJsonAsync(second)).GetProperty("reportId").GetString());

        // Somebody else reporting the same rating is a report of their own.
        var other = await RegisterAsync("ridemo");
        var third = await ReportAsync(other, body);
        Assert.Equal(HttpStatusCode.Created, third.StatusCode);
        Assert.NotEqual(firstId, (await ReadJsonAsync(third)).GetProperty("reportId").GetString());

        Assert.Equal(ResolveOutcome.Resolved, await Moderation().ResolveReportAsync(firstId!, default));

        var afterResolve = await ReportAsync(reporter, body);
        Assert.Equal(HttpStatusCode.Created, afterResolve.StatusCode);
        Assert.NotEqual(firstId, (await ReadJsonAsync(afterResolve)).GetProperty("reportId").GetString());
    }

    [SkippableFact]
    public async Task Own_content_and_own_account_cannot_be_reported()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("rself");
        var ratingId = await CreateRatingAsync(me, $"place_{Guid.NewGuid():N}", "Cafe", 4, "Latte");
        var commentId = await CommentAsync(me, ratingId, "my own words");

        foreach (var body in new[]
        {
            $$"""{"targetType":"rating","targetId":"{{ratingId}}","reason":"spam"}""",
            $$"""{"targetType":"comment","targetId":"{{commentId}}","ratingId":"{{ratingId}}","reason":"spam"}""",
            $$"""{"targetType":"user","targetId":"{{me.UserId}}","reason":"spam"}""",
        })
        {
            var response = await ReportAsync(me, body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("cannot_report_self", await ErrorAsync(response));
        }
    }

    [SkippableFact]
    public async Task Missing_targets_are_not_found()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("rmissing");
        var other = await RegisterAsync("rmissingo");
        var ratingId = await CreateRatingAsync(other, $"place_{Guid.NewGuid():N}", "Cafe", 4, "Latte");
        var missing = Guid.NewGuid().ToString("D");

        foreach (var body in new[]
        {
            $$"""{"targetType":"rating","targetId":"{{missing}}","reason":"spam"}""",
            $$"""{"targetType":"comment","targetId":"{{missing}}","ratingId":"{{ratingId}}","reason":"spam"}""",
            $$"""{"targetType":"comment","targetId":"{{missing}}","ratingId":"{{missing}}","reason":"spam"}""",
            $$"""{"targetType":"user","targetId":"{{missing}}","reason":"spam"}""",
        })
        {
            var response = await ReportAsync(me, body);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("not_found", await ErrorAsync(response));
        }
    }

    [SkippableTheory]
    [InlineData("""{"targetType":"place","targetId":"x","reason":"spam"}""", "invalid_target_type")]
    [InlineData("""{"targetType":"rating","targetId":"x","reason":"boring"}""", "invalid_reason")]
    [InlineData("""{"targetType":"rating","targetId":"","reason":"spam"}""", "targetId is required")]
    [InlineData("""{"targetType":"comment","targetId":"x","reason":"spam"}""", "ratingId is required for comments")]
    public async Task Malformed_reports_are_rejected(string body, string error)
    {
        RequireInfrastructure();
        var me = await RegisterAsync("rbad");

        var response = await ReportAsync(me, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(error, await ErrorAsync(response));
    }

    [SkippableFact]
    public async Task Details_over_500_characters_and_anonymous_callers_are_refused()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("rdet");
        var other = await RegisterAsync("rdeto");

        var tooLong = await ReportAsync(me,
            $$"""{"targetType":"user","targetId":"{{other.UserId}}","reason":"other","details":"{{new string('x', 501)}}"}""");
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        var anonymous = await Client().PostAsync("/v1/reports",
            Body($$"""{"targetType":"user","targetId":"{{other.UserId}}","reason":"other"}"""));
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    [SkippableFact]
    public async Task Every_new_report_is_pushed_to_the_moderators_regardless_of_their_preferences()
    {
        RequireInfrastructure();
        Fixture.PushSender.Reset();
        var moderator = await ModeratorAsync();
        const string device = "ExponentPushToken[moderator0001]";
        await PushOk(PushClient(moderator.Token).PutAsync("/v1/push/tokens", Body($$"""{"token":"{{device}}","platform":"ios"}""")));
        // Every user-facing type switched off: the moderator push is not one of them.
        await PushOk(PushClient(moderator.Token).PutAsync("/v1/notification-prefs",
            Body("""{"tagged":false,"like":false,"comment":false,"follow":false,"friendRating":false}""")));

        var reporter = await RegisterAsync("rpush");
        var author = await RegisterAsync("rpusha");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Cafe", 2, "Latte");

        var rating = await PushClient(reporter.Token).PostAsync("/v1/reports",
            Body($$"""{"targetType":"rating","targetId":"{{ratingId}}","reason":"offensive"}"""));
        Assert.Equal(HttpStatusCode.Created, rating.StatusCode);
        var user = await PushClient(reporter.Token).PostAsync("/v1/reports",
            Body($$"""{"targetType":"user","targetId":"{{author.UserId}}","reason":"harassment"}"""));
        Assert.Equal(HttpStatusCode.Created, user.StatusCode);

        var messages = Fixture.PushSender.OfType("report");
        Assert.Equal(2, messages.Count);
        Assert.All(messages, m => Assert.Equal(device, m.To));

        Assert.Equal("New report: rating", messages[0].Title);
        Assert.Equal($"offensive · @{author.Username}: Latte", messages[0].Body);
        Assert.Equal(ratingId, messages[0].Data.RatingId);

        Assert.Equal("New report: user", messages[1].Title);
        Assert.Equal($"harassment · @{author.Username}: rpusha tester", messages[1].Body);
        Assert.Null(messages[1].Data.RatingId);
        Assert.Equal(author.Username, messages[1].Data.Username);

        // An idempotent re-report is not a new report: no second push.
        Fixture.PushSender.Reset();
        var again = await PushClient(reporter.Token).PostAsync("/v1/reports",
            Body($$"""{"targetType":"rating","targetId":"{{ratingId}}","reason":"offensive"}"""));
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Empty(Fixture.PushSender.OfType("report"));
    }

    // ── Operator side (Coffee.Admin) ────────────────────────────────────────

    [SkippableFact]
    public async Task The_queue_lists_newest_first_and_resolving_takes_a_report_out_of_the_open_view()
    {
        RequireInfrastructure();
        var reporter = await RegisterAsync("rqueue");
        var author = await RegisterAsync("rqueuea");
        var older = await ReportIdAsync(reporter, $$"""{"targetType":"user","targetId":"{{author.UserId}}","reason":"spam"}""");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Cafe", 2, "Latte");
        var newer = await ReportIdAsync(reporter, $$"""{"targetType":"rating","targetId":"{{ratingId}}","reason":"spam"}""");

        var open = await Moderation().ListReportsAsync(openOnly: true, limit: 500, default);
        var ids = open.Select(r => r.ReportId).ToList();
        Assert.True(ids.IndexOf(newer) >= 0 && ids.IndexOf(newer) < ids.IndexOf(older));
        var listed = open.Single(r => r.ReportId == newer);
        Assert.Equal("rating", listed.TargetType);
        Assert.Equal(author.Username, listed.TargetUsername);
        Assert.Equal(reporter.Username, listed.ReporterUsername);
        Assert.Equal("Latte", listed.Excerpt);
        Assert.Single(await Moderation().ListReportsAsync(openOnly: true, limit: 1, default));

        Assert.Equal(ResolveOutcome.Resolved, await Moderation().ResolveReportAsync(older, default));
        Assert.Equal(ResolveOutcome.AlreadyResolved, await Moderation().ResolveReportAsync(older, default));
        Assert.Equal(ResolveOutcome.NotFound, await Moderation().ResolveReportAsync(Guid.NewGuid().ToString("D"), default));

        Assert.DoesNotContain(older, (await Moderation().ListReportsAsync(true, 500, default)).Select(r => r.ReportId));
        var all = await Moderation().ListReportsAsync(false, 500, default);
        Assert.Equal("resolved", all.Single(r => r.ReportId == older).Status);
        Assert.True((await ReportRowAsync(older)).ContainsKey("resolvedAt"));
    }

    [SkippableFact]
    public async Task Removing_a_rating_tears_down_every_copy_and_its_photo_and_is_idempotent()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("rmrate");
        var liker = await RegisterAsync("rmratel");
        var place = $"place_{Guid.NewGuid():N}";
        var keep = await CreateRatingAsync(liker, place, "Cafe", 5, "Filter");
        var photoKey = await UploadPhotoAsync(author);
        var response = await Client(author.Token).PostAsync("/v1/ratings", Body($$"""
            {"placeId":"{{place}}","placeName":"Cafe","stars":1,"drinkName":"Bad","lat":54.6872,"lng":25.2797,"photoKey":"{{photoKey}}"}
            """));
        var ratingId = (await ReadJsonAsync(response)).GetProperty("ratingId").GetString()!;
        await Client(liker.Token).PostAsync($"/v1/ratings/{ratingId}/like", null);
        await CommentAsync(liker, ratingId, "hmm");

        var (removed, photoDeleted) = await Moderation(withPhotos: true).RemoveRatingAsync(ratingId, default);

        Assert.True(removed);
        Assert.True(photoDeleted);
        Assert.Equal(HttpStatusCode.NotFound, (await Client(liker.Token).GetAsync($"/v1/ratings/{ratingId}")).StatusCode);
        Assert.DoesNotContain(ratingId, RatingIds(await ReadJsonAsync(await Client(liker.Token).GetAsync($"/v1/places/{place}/ratings"))));
        Assert.DoesNotContain(ratingId, RatingIds(await ReadJsonAsync(await Client().GetAsync($"/v1/users/{author.Username}/ratings"))));
        var placeDto = await ReadJsonAsync(await Client(liker.Token).GetAsync($"/v1/places/{place}"));
        Assert.Equal(1, placeDto.GetProperty("ratingCount").GetInt32());
        Assert.Equal(5, placeDto.GetProperty("avgRating").GetDouble());
        Assert.Contains(keep, RatingIds(await ReadJsonAsync(await Client(liker.Token).GetAsync($"/v1/places/{place}/ratings"))));
        Assert.False(await PhotoExistsAsync(photoKey));

        Assert.Equal((false, false), await Moderation(withPhotos: true).RemoveRatingAsync(ratingId, default));
    }

    [SkippableFact]
    public async Task Removing_a_comment_decrements_the_counter_once()
    {
        RequireInfrastructure();
        var author = await RegisterAsync("rmcom");
        var commenter = await RegisterAsync("rmcomc");
        var ratingId = await CreateRatingAsync(author, $"place_{Guid.NewGuid():N}", "Cafe", 4, "Latte");
        var bad = await CommentAsync(commenter, ratingId, "nasty");
        await CommentAsync(commenter, ratingId, "fine");

        Assert.True(await Moderation().RemoveCommentAsync(ratingId, bad, default));
        Assert.False(await Moderation().RemoveCommentAsync(ratingId, bad, default));

        var detail = await ReadJsonAsync(await Client(author.Token).GetAsync($"/v1/ratings/{ratingId}"));
        Assert.Equal(["fine"], detail.GetProperty("comments").EnumerateArray().Select(c => c.GetProperty("text").GetString()!));
        Assert.Equal(1, detail.GetProperty("rating").GetProperty("commentCount").GetInt32());
        var ownList = await ReadJsonAsync(await Client().GetAsync($"/v1/users/{author.Username}/ratings"));
        Assert.Equal(1, ownList.GetProperty("ratings")[0].GetProperty("commentCount").GetInt32());
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /// <summary>The account <see cref="IntegrationFixture.ModeratorUsername"/> names on the push host
    /// (created once per run; later tests sign in to it instead).</summary>
    private async Task<TestUser> ModeratorAsync()
    {
        var username = IntegrationFixture.ModeratorUsername;
        var register = await Client().PostAsync("/v1/auth/register",
            Body($$"""{"username":"{{username}}","displayName":"Mod","password":"coffee123"}"""));
        var response = register.StatusCode == HttpStatusCode.Conflict
            ? await Client().PostAsync("/v1/auth/login", Body($$"""{"username":"{{username}}","password":"coffee123"}"""))
            : register;
        var json = await ReadJsonAsync(response);
        return new TestUser(
            json.GetProperty("token").GetString()!,
            json.GetProperty("user").GetProperty("userId").GetString()!,
            username);
    }

    private ModerationService Moderation(bool withPhotos = false)
    {
        var services = Fixture.Services;
        return new ModerationService(
            services.GetRequiredService<CoffeeDb>(),
            services.GetRequiredService<RatingStore>(),
            withPhotos ? services.GetRequiredService<IPhotoStorage>() : null);
    }

    private HttpClient PushClient(string? token = null)
    {
        var client = Fixture.PushHost.CreateClient();
        if (token is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static async Task PushOk(Task<HttpResponseMessage> call) =>
        Assert.Equal(HttpStatusCode.OK, (await call).StatusCode);

    private Task<HttpResponseMessage> ReportAsync(TestUser who, string body) =>
        Client(who.Token).PostAsync("/v1/reports", Body(body));

    private async Task<string> ReportIdAsync(TestUser who, string body)
    {
        var response = await ReportAsync(who, body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await ReadJsonAsync(response)).GetProperty("reportId").GetString()!;
    }

    private async Task<string> CommentAsync(TestUser who, string ratingId, string text)
    {
        var response = await Client(who.Token).PostAsync($"/v1/ratings/{ratingId}/comments",
            Body(JsonSerializer.Serialize(new Dictionary<string, string> { ["text"] = text })));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await ReadJsonAsync(response)).GetProperty("commentId").GetString()!;
    }

    private static async Task<string?> ErrorAsync(HttpResponseMessage response) =>
        (await ReadJsonAsync(response)).GetProperty("error").GetString();

    private async Task<Dictionary<string, AttributeValue>> ReportRowAsync(string reportId) =>
        (await RowAsync($"REPORT#{reportId}", "META")) ?? throw new Xunit.Sdk.XunitException($"no REPORT#{reportId}");

    private async Task<Dictionary<string, AttributeValue>?> RowAsync(string pk, string sk)
    {
        var response = await Fixture.Dynamo.GetItemAsync(new GetItemRequest
        {
            TableName = Fixture.TableName,
            Key = new Dictionary<string, AttributeValue> { ["PK"] = new() { S = pk }, ["SK"] = new() { S = sk } },
            ConsistentRead = true,
        });
        return response.IsItemSet ? response.Item : null;
    }

    private async Task<string> UploadPhotoAsync(TestUser user)
    {
        var presign = await ReadJsonAsync(await Client(user.Token).PostAsync("/v1/photos/upload-url",
            Body("""{"fileName":"bad.jpg","contentType":"image/jpeg"}""")));
        using var put = new HttpRequestMessage(HttpMethod.Put, presign.GetProperty("uploadUrl").GetString())
        {
            Content = new ByteArrayContent([0xFF, 0xD8, 0xFF, 0xD9]),
        };
        put.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        using var http = new HttpClient();
        Assert.True((await http.SendAsync(put)).IsSuccessStatusCode);
        return presign.GetProperty("key").GetString()!;
    }

    private static async Task<bool> PhotoExistsAsync(string key)
    {
        using var s3 = new Amazon.S3.AmazonS3Client("minioadmin", "minioadmin", new Amazon.S3.AmazonS3Config
        {
            ServiceURL = IntegrationFixture.S3Url,
            ForcePathStyle = true,
            AuthenticationRegion = "eu-west-1",
        });
        try
        {
            await s3.GetObjectMetadataAsync(IntegrationFixture.Bucket, key);
            return true;
        }
        catch (Amazon.S3.AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}
