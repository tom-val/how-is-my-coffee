using System.Net;
using System.Text.Json;
using Amazon.DynamoDBv2.Model;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// <c>GET /v1/places</c> — the map / discovery query. Every test owns a private patch of the planet
/// (the suite shares one table, and every place anyone rates lands in the same GSI1 partition), so a
/// bounding box is enough to isolate it from the rest of the run.
/// </summary>
public class PlacesMapTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    [SkippableFact]
    public async Task Bbox_keeps_the_places_inside_it_and_drops_the_rest()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("bboxer");
        var inside = await RateAtAsync(user, 10.10, 10.10, "Inside Cafe");
        var outside = await RateAtAsync(user, 10.90, 10.90, "Outside Cafe");

        var places = await MapAsync(user.Token, "bbox=10.0,10.0,10.5,10.5");

        Assert.Contains(inside, PlaceIds(places));
        Assert.DoesNotContain(outside, PlaceIds(places));
    }

    [SkippableFact]
    public async Task Friends_filter_keeps_only_my_places_and_my_friends_places()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("mapme");
        var friend = await RegisterAsync("mapfri");
        var stranger = await RegisterAsync("mapstr");
        await FollowAsync(me, friend);

        var mine = await RateAtAsync(me, 20.10, 20.10, "My Cafe");
        var friends = await RateAtAsync(friend, 20.20, 20.20, "Friend Cafe");
        var theirs = await RateAtAsync(stranger, 20.30, 20.30, "Stranger Cafe");

        var all = PlaceIds(await MapAsync(me.Token, "bbox=20.0,20.0,20.5,20.5")).ToList();
        var followed = PlaceIds(await MapAsync(me.Token, "bbox=20.0,20.0,20.5,20.5&friends=true")).ToList();

        Assert.Contains(theirs, all);
        Assert.Contains(mine, followed);
        Assert.Contains(friends, followed);
        Assert.DoesNotContain(theirs, followed);
    }

    [SkippableFact]
    public async Task Friend_count_counts_followed_users_only()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("fcme");
        var friendA = await RegisterAsync("fca");
        var friendB = await RegisterAsync("fcb");
        var stranger = await RegisterAsync("fcstr");
        await FollowAsync(me, friendA);
        await FollowAsync(me, friendB);

        var placeId = await RateAtAsync(me, 30.10, 30.10, "Popular Cafe");
        foreach (var other in (TestUser[])[friendA, friendB, stranger])
        {
            await CreateRatingAsync(other, placeId, "Popular Cafe", 4, "Latte", lat: 30.10, lng: 30.10);
        }

        var place = Single(await MapAsync(me.Token, "bbox=30.0,30.0,30.5,30.5"), placeId);

        // Four people have rated it; two of them are ones I follow, and I am never my own friend.
        Assert.Equal(4, place.GetProperty("ratingCount").GetInt32());
        Assert.Equal(2, place.GetProperty("friendCount").GetInt32());
        Assert.True(place.GetProperty("visitedByMe").GetBoolean());
    }

    [SkippableFact]
    public async Task My_visits_are_reported_per_place()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("visme");
        var other = await RegisterAsync("visoth");

        var visited = await RateAtAsync(me, 40.10, 40.10, "Regular Cafe");
        await CreateRatingAsync(me, visited, "Regular Cafe", 3, "Tea", lat: 40.10, lng: 40.10);
        var unvisited = await RateAtAsync(other, 40.20, 40.20, "Never Been");

        var places = await MapAsync(me.Token, "bbox=40.0,40.0,40.5,40.5");

        var mine = Single(places, visited);
        Assert.True(mine.GetProperty("visitedByMe").GetBoolean());
        Assert.Equal(2, mine.GetProperty("myVisitCount").GetInt32());

        var theirs = Single(places, unvisited);
        Assert.False(theirs.GetProperty("visitedByMe").GetBoolean());
        Assert.Equal(0, theirs.GetProperty("myVisitCount").GetInt32());
        Assert.Equal(0, theirs.GetProperty("friendCount").GetInt32());
    }

    [SkippableFact]
    public async Task Limit_keeps_the_most_rated_places_first()
    {
        RequireInfrastructure();
        var me = await RegisterAsync("limme");
        var other = await RegisterAsync("limoth");

        var popular = await RateAtAsync(me, 60.10, 60.10, "Busy Cafe");
        await CreateRatingAsync(other, popular, "Busy Cafe", 4, "Latte", lat: 60.10, lng: 60.10);
        var quiet = await RateAtAsync(me, 60.20, 60.20, "Quiet Cafe");

        var places = await MapAsync(me.Token, "bbox=60.0,60.0,60.5,60.5&limit=1");

        Assert.Equal([popular], PlaceIds(places).ToArray());
        Assert.DoesNotContain(quiet, PlaceIds(places));
    }

    [SkippableTheory]
    // Not four numbers / not numbers at all.
    [InlineData("10,10,10")]
    [InlineData("10,10,10,10,10")]
    [InlineData("a,b,c,d")]
    [InlineData("10,10,10,NaN")]
    // Outside the coordinate system.
    [InlineData("-181,10,10,20")]
    [InlineData("10,-91,20,20")]
    [InlineData("10,10,20,91")]
    // Inverted — a viewport crossing the antimeridian, or simply min > max.
    [InlineData("170,10,-170,20")]
    [InlineData("10,30,20,20")]
    public async Task Malformed_bbox_is_rejected(string bbox)
    {
        RequireInfrastructure();
        var user = await RegisterAsync("badbox");

        var response = await Client(user.Token).GetAsync($"/v1/places?bbox={Uri.EscapeDataString(bbox)}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_bbox", (await ReadJsonAsync(response)).GetProperty("error").GetString());
    }

    [SkippableFact]
    public async Task Map_needs_a_token()
    {
        RequireInfrastructure();

        var response = await Client().GetAsync("/v1/places?bbox=10,10,20,20");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// Places rated on the old Node stack have no GSI1 keys, so the map cannot see them. The next
    /// rating there recomputes the stats — which is where the keys are written — and they appear.
    /// </summary>
    [SkippableFact]
    public async Task A_place_without_gsi1_keys_appears_once_someone_rates_it_again()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("legacy");
        var placeId = $"place_{Guid.NewGuid():N}";
        const string Bbox = "bbox=18.0,-34.0,18.9,-33.0";

        // A row exactly as the old backend wrote it: no GSI1PK/GSI1SK, and no address either.
        await Fixture.Dynamo.PutItemAsync(new PutItemRequest
        {
            TableName = Fixture.TableName,
            Item = new Dictionary<string, AttributeValue>
            {
                ["PK"] = new() { S = $"PLACE#{placeId}" },
                ["SK"] = new() { S = "META" },
                ["placeId"] = new() { S = placeId },
                ["name"] = new() { S = "Old Cafe" },
                ["lat"] = new() { N = "-33.9249" },
                ["lng"] = new() { N = "18.4241" },
                ["avgRating"] = new() { N = "4" },
                ["ratingCount"] = new() { N = "1" },
                ["entityType"] = new() { S = "Place" },
            },
        });

        Assert.DoesNotContain(placeId, PlaceIds(await MapAsync(user.Token, Bbox)));

        await CreateRatingAsync(user, placeId, "Old Cafe", 5, "Espresso", lat: -33.9249, lng: 18.4241);

        var healed = Single(await MapAsync(user.Token, Bbox), placeId);
        Assert.Equal("Old Cafe", healed.GetProperty("name").GetString());
        Assert.True(healed.GetProperty("visitedByMe").GetBoolean());
    }

    [SkippableFact]
    public async Task A_place_without_an_address_reports_null()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("noaddr");
        var placeId = $"place_{Guid.NewGuid():N}";

        await Fixture.Dynamo.PutItemAsync(new PutItemRequest
        {
            TableName = Fixture.TableName,
            Item = new Dictionary<string, AttributeValue>
            {
                ["PK"] = new() { S = $"PLACE#{placeId}" },
                ["SK"] = new() { S = "META" },
                ["placeId"] = new() { S = placeId },
                ["name"] = new() { S = "Address-less Cafe" },
                ["lat"] = new() { N = "-10.5" },
                ["lng"] = new() { N = "-10.5" },
                ["avgRating"] = new() { N = "3" },
                ["ratingCount"] = new() { N = "1" },
                ["entityType"] = new() { S = "Place" },
                ["GSI1PK"] = new() { S = "PLACE" },
                ["GSI1SK"] = new() { S = placeId },
            },
        });

        var place = Single(await MapAsync(user.Token, "bbox=-11,-11,-10,-10"), placeId);

        Assert.Equal(JsonValueKind.Null, place.GetProperty("address").ValueKind);
    }

    // ---- helpers -------------------------------------------------------------------------------

    private async Task<JsonElement> MapAsync(string token, string query)
    {
        var response = await Client(token).GetAsync($"/v1/places?{query}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await ReadJsonAsync(response)).GetProperty("places");
    }

    private static IEnumerable<string> PlaceIds(JsonElement places) =>
        places.EnumerateArray().Select(p => p.GetProperty("placeId").GetString()!);

    private static JsonElement Single(JsonElement places, string placeId) =>
        places.EnumerateArray().Single(p => p.GetProperty("placeId").GetString() == placeId);

    /// <summary>Creates a fresh place at the given coordinates by rating it, and returns its id.</summary>
    private async Task<string> RateAtAsync(TestUser author, double lat, double lng, string name)
    {
        var placeId = $"place_{Guid.NewGuid():N}";
        await CreateRatingAsync(author, placeId, name, 4, "Latte", lat: lat, lng: lng);
        return placeId;
    }

    private async Task FollowAsync(TestUser follower, TestUser target)
    {
        var response = await Client(follower.Token).PostAsync("/v1/friends",
            Body($$"""{"friendUsername":"{{target.Username}}"}"""));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }
}
