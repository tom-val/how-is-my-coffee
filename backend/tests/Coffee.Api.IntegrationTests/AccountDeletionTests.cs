using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Amazon.DynamoDBv2.Model;
using Amazon.S3;
using Amazon.S3.Model;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// <c>DELETE /v1/me</c> end to end: a user with ratings, a photo, reactions on someone else's
/// rating, tags in both directions, follows in both directions and a device — and afterwards nothing
/// of theirs is left, while the other user's data is intact with its counters corrected.
/// </summary>
public class AccountDeletionTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    private const string PushToken = "ExponentPushToken[account-deletion-test]";

    [SkippableFact]
    public async Task A_wrong_password_is_refused_and_nothing_is_deleted()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("keepme");
        var ratingId = await CreateRatingAsync(user, $"place_{Guid.NewGuid():N}", "Vero", 4, "Latte");

        var wrong = await DeleteAccountAsync(user.Token, "not-my-password");
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal("invalid_credentials", (await ReadJsonAsync(wrong)).GetProperty("error").GetString());

        var missing = await Client(user.Token).SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/v1/me"));
        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await Client(user.Token).GetAsync("/v1/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client(user.Token).GetAsync($"/v1/ratings/{ratingId}")).StatusCode);
    }

    [SkippableFact]
    public async Task Without_a_token_it_is_unauthorized()
    {
        RequireInfrastructure();

        var response = await DeleteAccountAsync(token: null, "coffee123");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthorized", (await ReadJsonAsync(response)).GetProperty("error").GetString());
    }

    [SkippableFact]
    public async Task Deleting_an_account_removes_everything_tied_to_it()
    {
        RequireInfrastructure();
        var a = await RegisterAsync("leaver");
        var b = await RegisterAsync("stayer");
        var c = await RegisterAsync("bystander");
        var sharedPlace = $"place_{Guid.NewGuid():N}";
        var otherPlace = $"place_{Guid.NewGuid():N}";

        // A: one rating with a real photo in MinIO (at the place B also rated), one tagging B.
        var photoKey = await UploadPhotoAsync(a);
        var aPhotoRating = await CreateRatingWithPhotoAsync(a, sharedPlace, 2, photoKey);
        var aTaggingB = await CreateRatingAsync(a, otherPlace, "Elsewhere", 5, "Tea", 40,
            $$"""[{"username":"{{b.Username}}"}]""");

        // B's rating at the shared place tags A and a guest; A and C both like it, A comments.
        var bRating = await CreateRatingAsync(b, sharedPlace, "Shared Cafe", 4, "Flat White", 130,
            $$"""[{"username":"{{a.Username}}"},{"displayName":"Guest Zoe"}]""");
        Assert.Equal(HttpStatusCode.OK, (await Client(a.Token).PostAsync($"/v1/ratings/{bRating}/like", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client(c.Token).PostAsync($"/v1/ratings/{bRating}/like", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Client(a.Token).PostAsync(
            $"/v1/ratings/{bRating}/comments", Body("""{"text":"so good"}"""))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Client(c.Token).PostAsync(
            $"/v1/ratings/{bRating}/comments", Body("""{"text":"agreed"}"""))).StatusCode);

        // Follows both ways, and a device.
        Assert.Equal(HttpStatusCode.Created, (await Client(a.Token).PostAsync(
            "/v1/friends", Body($$"""{"friendUsername":"{{b.Username}}"}"""))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Client(b.Token).PostAsync(
            "/v1/friends", Body($$"""{"friendUsername":"{{a.Username}}"}"""))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client(a.Token).PutAsync(
            "/v1/push/tokens", Body($$"""{"token":"{{PushToken}}","platform":"ios"}"""))).StatusCode);

        // Sanity-check the fixture before tearing it down.
        Assert.True(await PhotoExistsAsync(photoKey));
        Assert.Equal(2, (await PlaceAsync(sharedPlace)).GetProperty("ratingCount").GetInt32());
        var bFeedBefore = RatingIds(await ReadJsonAsync(await Client(b.Token).GetAsync("/v1/feed?limit=50"))).ToList();
        Assert.Contains(aPhotoRating, bFeedBefore);
        Assert.Contains(aTaggingB, bFeedBefore);
        Assert.NotEmpty(await RowsAsync(b.UserId, "TAGGED#"));

        var deleted = await DeleteAccountAsync(a.Token, "coffee123");
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        Assert.Equal("deleted", (await ReadJsonAsync(deleted)).GetProperty("status").GetString());

        // A's partition and username lookup: nothing left (profile, ratings, places, tags, friends, devices).
        Assert.Empty(await RowsAsync(a.UserId));
        Assert.Null(await GetRowAsync($"USERNAME#{a.Username}", "USERNAME"));

        // A's ratings: all three copies and their RATING# partitions are gone.
        foreach (var ratingId in new[] { aPhotoRating, aTaggingB })
        {
            Assert.Empty(await PartitionAsync($"RATING#{ratingId}"));
            Assert.Equal(HttpStatusCode.NotFound, (await Client(b.Token).GetAsync($"/v1/ratings/{ratingId}")).StatusCode);
        }
        Assert.DoesNotContain(await PartitionAsync($"PLACE#{sharedPlace}"), i => i["SK"].S.Contains(aPhotoRating));
        Assert.DoesNotContain(await PartitionAsync($"PLACE#{otherPlace}"), i => i["SK"].S.Contains(aTaggingB));

        // B's side: feed without A, no mirror follow rows, no TAGGED# pointer to A's rating.
        var bFeed = RatingIds(await ReadJsonAsync(await Client(b.Token).GetAsync("/v1/feed?limit=50"))).ToList();
        Assert.DoesNotContain(aPhotoRating, bFeed);
        Assert.DoesNotContain(aTaggingB, bFeed);
        Assert.Contains(bRating, bFeed);
        Assert.Null(await GetRowAsync($"USER#{b.UserId}", $"FRIEND#{a.UserId}"));
        Assert.Null(await GetRowAsync($"USER#{b.UserId}", $"FOLLOWER#{a.UserId}"));
        Assert.Empty(await RowsAsync(b.UserId, "TAGGED#"));
        Assert.Empty(RatingIds(await ReadJsonAsync(await Client(b.Token).GetAsync($"/v1/users/{b.Username}/tagged"))));

        // Place stats recomputed from B's rating alone; the place only A rated is back to zero.
        var shared = await PlaceAsync(sharedPlace);
        Assert.Equal(1, shared.GetProperty("ratingCount").GetInt32());
        Assert.Equal(4, shared.GetProperty("avgRating").GetDouble());
        Assert.Equal("0", (await GetRowAsync($"PLACE#{otherPlace}", "META"))!["ratingCount"].N);

        // B's rating: counters decremented by exactly A's share on all three copies (C's like and
        // comment remain), A's like and comment gone, A out of the companions, the guest kept.
        var createdAt = (await GetRowAsync($"RATING#{bRating}", "META"))!["createdAt"].S;
        var sk = $"RATING#{createdAt}#{bRating}";
        foreach (var (pk, rowSk) in new[] { ($"RATING#{bRating}", "META"), ($"USER#{b.UserId}", sk), ($"PLACE#{sharedPlace}", sk) })
        {
            var copy = (await GetRowAsync(pk, rowSk))!;
            Assert.Equal("1", copy["likeCount"].N);
            Assert.Equal("1", copy["commentCount"].N);
            var companions = copy["companions"].L;
            Assert.Single(companions);
            Assert.Equal("Guest Zoe", companions[0].M["displayName"].S);
        }

        var detail = await ReadJsonAsync(await Client(b.Token).GetAsync($"/v1/ratings/{bRating}"));
        Assert.DoesNotContain(detail.GetProperty("likes").EnumerateArray(), l => l.GetProperty("userId").GetString() == a.UserId);
        Assert.DoesNotContain(detail.GetProperty("comments").EnumerateArray(), x => x.GetProperty("userId").GetString() == a.UserId);
        Assert.Single(detail.GetProperty("comments").EnumerateArray());
        Assert.Equal(1, detail.GetProperty("rating").GetProperty("likeCount").GetInt32());

        // The photo object is gone from the bucket.
        Assert.False(await PhotoExistsAsync(photoKey));

        // A's token is still signed and unexpired, but resolves to nobody.
        foreach (var path in new[] { "/v1/feed", "/v1/me", "/v1/friends" })
        {
            var response = await Client(a.Token).GetAsync(path);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("unauthorized", (await ReadJsonAsync(response)).GetProperty("error").GetString());
        }

        // Calling it again is harmless: the account no longer exists, so it is a plain 401.
        var again = await DeleteAccountAsync(a.Token, "coffee123");
        Assert.Equal(HttpStatusCode.Unauthorized, again.StatusCode);
        Assert.Equal("unauthorized", (await ReadJsonAsync(again)).GetProperty("error").GetString());

        // The username is free again.
        var reRegister = await Client().PostAsync("/v1/auth/register",
            Body($$"""{"username":"{{a.Username}}","displayName":"New owner","password":"coffee123"}"""));
        Assert.Equal(HttpStatusCode.Created, reRegister.StatusCode);
        var newUserId = (await ReadJsonAsync(reRegister)).GetProperty("user").GetProperty("userId").GetString();
        Assert.NotEqual(a.UserId, newUserId);
    }

    /// <summary>
    /// A Lambda that dies half-way leaves some rows behind; the retry (same token, same password,
    /// because the profile goes last) must finish the job rather than trip over the missing pieces.
    /// </summary>
    [SkippableFact]
    public async Task A_retry_after_a_partial_deletion_finishes_the_job()
    {
        RequireInfrastructure();
        var a = await RegisterAsync("halfgone");
        var b = await RegisterAsync("halfpeer");
        var place = $"place_{Guid.NewGuid():N}";
        var aRating = await CreateRatingAsync(a, place, "Half Cafe", 3, "Mocha");
        var bRating = await CreateRatingAsync(b, place, "Half Cafe", 5, "Cortado");
        await Client(a.Token).PostAsync($"/v1/ratings/{bRating}/like", null);
        await Client(a.Token).PostAsync("/v1/friends", Body($$"""{"friendUsername":"{{b.Username}}"}"""));

        // Simulate a crash mid-way: A's rating lost its META and PLACE# copy but not its USER# copy,
        // and the follower mirror on B is gone while A's own FRIEND# row survived.
        var meta = (await GetRowAsync($"RATING#{aRating}", "META"))!;
        var sk = $"RATING#{meta["createdAt"].S}#{aRating}";
        await DeleteRowAsync($"RATING#{aRating}", "META");
        await DeleteRowAsync($"PLACE#{place}", sk);
        await DeleteRowAsync($"USER#{b.UserId}", $"FOLLOWER#{a.UserId}");

        // And counter drift from the old stack: B's PLACE# copy already reads 0 likes although A's
        // like row exists. The decrement must fix the other copies without driving this one negative.
        var bMeta = (await GetRowAsync($"RATING#{bRating}", "META"))!;
        var bSk = $"RATING#{bMeta["createdAt"].S}#{bRating}";
        await Fixture.Dynamo.UpdateItemAsync(new UpdateItemRequest
        {
            TableName = Fixture.TableName,
            Key = new() { ["PK"] = new AttributeValue($"PLACE#{place}"), ["SK"] = new AttributeValue(bSk) },
            UpdateExpression = "SET likeCount = :zero",
            ExpressionAttributeValues = new() { [":zero"] = new AttributeValue { N = "0" } },
        });

        var response = await DeleteAccountAsync(a.Token, "coffee123");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        Assert.Empty(await RowsAsync(a.UserId));
        Assert.Empty(await PartitionAsync($"RATING#{aRating}"));
        var stats = await PlaceAsync(place);
        Assert.Equal(1, stats.GetProperty("ratingCount").GetInt32());
        Assert.Equal(5, stats.GetProperty("avgRating").GetDouble());
        Assert.Null(await GetRowAsync($"RATING#{bRating}", $"LIKE#{a.UserId}"));
        Assert.Equal("0", (await GetRowAsync($"RATING#{bRating}", "META"))!["likeCount"].N);
        Assert.Equal("0", (await GetRowAsync($"USER#{b.UserId}", bSk))!["likeCount"].N);
        Assert.Equal("0", (await GetRowAsync($"PLACE#{place}", bSk))!["likeCount"].N);
    }

    /// <summary>
    /// <c>photoKey</c> is client-supplied, so a rating may point at somebody else's upload. Deleting
    /// the rating's author must not take that object down with it.
    /// </summary>
    [SkippableFact]
    public async Task Only_the_users_own_photos_are_deleted()
    {
        RequireInfrastructure();
        var owner = await RegisterAsync("photoown");
        var borrower = await RegisterAsync("photoborrow");
        var foreignKey = await UploadPhotoAsync(owner);
        await CreateRatingWithPhotoAsync(borrower, $"place_{Guid.NewGuid():N}", 3, foreignKey);

        Assert.Equal(HttpStatusCode.OK, (await DeleteAccountAsync(borrower.Token, "coffee123")).StatusCode);

        Assert.True(await PhotoExistsAsync(foreignKey));
    }

    private Task<HttpResponseMessage> DeleteAccountAsync(string? token, string password) =>
        Client(token).SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/v1/me")
        {
            Content = Body($$"""{"password":"{{password}}"}"""),
        });

    private async Task<string> UploadPhotoAsync(TestUser user)
    {
        var json = await ReadJsonAsync(await Client(user.Token).PostAsync("/v1/photos/upload-url",
            Body("""{"fileName":"latte.jpg","contentType":"image/jpeg"}""")));
        using var raw = new HttpClient();
        var content = new ByteArrayContent(Encoding.UTF8.GetBytes("not really a jpeg"));
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        var put = await raw.PutAsync(json.GetProperty("uploadUrl").GetString()!, content);
        Assert.True(put.IsSuccessStatusCode, $"MinIO rejected the presigned PUT: {put.StatusCode}");
        return json.GetProperty("key").GetString()!;
    }

    private async Task<string> CreateRatingWithPhotoAsync(TestUser author, string placeId, double stars, string photoKey)
    {
        var response = await Client(author.Token).PostAsync("/v1/ratings", Body($$"""
            {"placeId":"{{placeId}}","placeName":"Shared Cafe","stars":{{Number(stars)}},"drinkName":"Latte",
             "photoKey":"{{photoKey}}","lat":54.6872,"lng":25.2797}
            """));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await ReadJsonAsync(response)).GetProperty("ratingId").GetString()!;
    }

    private async Task<JsonElement> PlaceAsync(string placeId)
    {
        // Any live user may read a place; register a throwaway reader rather than reuse a test actor.
        var reader = await RegisterAsync("reader");
        var response = await Client(reader.Token).GetAsync($"/v1/places/{placeId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await ReadJsonAsync(response);
    }

    private static async Task<bool> PhotoExistsAsync(string key)
    {
        using var s3 = new AmazonS3Client("minioadmin", "minioadmin", new AmazonS3Config
        {
            ServiceURL = IntegrationFixture.S3Url,
            ForcePathStyle = true,
            AuthenticationRegion = "eu-west-1",
        });
        try
        {
            await s3.GetObjectMetadataAsync(new GetObjectMetadataRequest { BucketName = IntegrationFixture.Bucket, Key = key });
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    private async Task<Dictionary<string, AttributeValue>?> GetRowAsync(string pk, string sk)
    {
        var response = await Fixture.Dynamo.GetItemAsync(new GetItemRequest
        {
            TableName = Fixture.TableName,
            Key = new() { ["PK"] = new AttributeValue(pk), ["SK"] = new AttributeValue(sk) },
            ConsistentRead = true,
        });
        return response.IsItemSet ? response.Item : null;
    }

    private Task DeleteRowAsync(string pk, string sk) =>
        Fixture.Dynamo.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = Fixture.TableName,
            Key = new() { ["PK"] = new AttributeValue(pk), ["SK"] = new AttributeValue(sk) },
        });

    private async Task<List<Dictionary<string, AttributeValue>>> PartitionAsync(string pk)
    {
        var response = await Fixture.Dynamo.QueryAsync(new QueryRequest
        {
            TableName = Fixture.TableName,
            KeyConditionExpression = "PK = :pk",
            ExpressionAttributeValues = new() { [":pk"] = new AttributeValue(pk) },
            ConsistentRead = true,
        });
        return response.Items;
    }

    private async Task<List<Dictionary<string, AttributeValue>>> RowsAsync(string userId, string skPrefix = "")
    {
        var rows = await PartitionAsync($"USER#{userId}");
        return [.. rows.Where(r => r["SK"].S.StartsWith(skPrefix, StringComparison.Ordinal))];
    }
}
