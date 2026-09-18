using System.Net;
using Amazon.DynamoDBv2.Model;
using Xunit;

namespace Coffee.Api.IntegrationTests;

public class AuthTests(IntegrationFixture fixture) : IntegrationTestBase(fixture)
{
    /// <summary>A hash in the old Node format for password <c>coffee123</c> (scrypt N=16384 r=8 p=1, 64 bytes).</summary>
    private const string LegacyScryptHash =
        "0123456789abcdef0123456789abcdef:12376cc10993d4566e71095e85367db477b56c9efe202de260557f6e5ac70df8d1e17573177baa24275bca129188eaa17ae889c03019e46a7c17b5ef2eb68262";

    [SkippableFact]
    public async Task Register_then_login_then_me()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("auth");

        var login = await Client().PostAsync("/v1/auth/login",
            Body($$"""{"username":"{{user.Username}}","password":"coffee123"}"""));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var token = (await ReadJsonAsync(login)).GetProperty("token").GetString()!;
        var me = await ReadJsonAsync(await Client(token).GetAsync("/v1/me"));

        Assert.Equal(user.UserId, me.GetProperty("userId").GetString());
        Assert.Equal(user.Username, me.GetProperty("username").GetString());
        // The hash must never leave the server, whatever else changes about this shape.
        Assert.False(me.TryGetProperty("passwordHash", out _));
    }

    [SkippableFact]
    public async Task Duplicate_username_is_a_conflict()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("dup");

        var again = await Client().PostAsync("/v1/auth/register",
            Body($$"""{"username":"{{user.Username}}","displayName":"Impostor","password":"coffee123"}"""));

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("username_taken", (await ReadJsonAsync(again)).GetProperty("error").GetString());
    }

    [SkippableFact]
    public async Task Wrong_password_is_rejected_without_revealing_anything()
    {
        RequireInfrastructure();
        var user = await RegisterAsync("wrong");

        var login = await Client().PostAsync("/v1/auth/login",
            Body($$"""{"username":"{{user.Username}}","password":"not-the-password"}"""));

        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        Assert.Equal("invalid_credentials", (await ReadJsonAsync(login)).GetProperty("error").GetString());
    }

    [SkippableFact]
    public async Task Unknown_username_gets_the_same_answer_as_a_wrong_password()
    {
        RequireInfrastructure();

        var login = await Client().PostAsync("/v1/auth/login",
            Body("""{"username":"nobody_at_all_here","password":"coffee123"}"""));

        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        Assert.Equal("invalid_credentials", (await ReadJsonAsync(login)).GetProperty("error").GetString());
    }

    /// <summary>
    /// The migration path that lets the old Node database keep working: a scrypt hash verifies once,
    /// and the stored value is replaced with a PBKDF2 one in the same request.
    /// </summary>
    [SkippableFact]
    public async Task Legacy_scrypt_login_succeeds_and_upgrades_the_stored_hash()
    {
        RequireInfrastructure();

        var userId = Guid.NewGuid().ToString("D");
        var username = $"legacy{Guid.NewGuid():N}"[..14];

        await Fixture.Dynamo.PutItemAsync(new PutItemRequest
        {
            TableName = Fixture.TableName,
            Item = new Dictionary<string, AttributeValue>
            {
                ["PK"] = new() { S = $"USERNAME#{username}" },
                ["SK"] = new() { S = "USERNAME" },
                ["userId"] = new() { S = userId },
                ["username"] = new() { S = username },
                // No GSI1 keys: the old Node backend never wrote them.
            },
        });
        await Fixture.Dynamo.PutItemAsync(new PutItemRequest
        {
            TableName = Fixture.TableName,
            Item = new Dictionary<string, AttributeValue>
            {
                ["PK"] = new() { S = $"USER#{userId}" },
                ["SK"] = new() { S = "PROFILE" },
                ["userId"] = new() { S = userId },
                ["username"] = new() { S = username },
                ["displayName"] = new() { S = "Legacy User" },
                ["passwordHash"] = new() { S = LegacyScryptHash },
                ["createdAt"] = new() { S = "2025-01-01T00:00:00.000Z" },
                ["entityType"] = new() { S = "User" },
            },
        });

        var login = await Client().PostAsync("/v1/auth/login",
            Body($$"""{"username":"{{username}}","password":"coffee123"}"""));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var stored = await Fixture.Dynamo.GetItemAsync(new GetItemRequest
        {
            TableName = Fixture.TableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["PK"] = new() { S = $"USER#{userId}" },
                ["SK"] = new() { S = "PROFILE" },
            },
        });
        Assert.StartsWith("pbkdf2$", stored.Item["passwordHash"].S, StringComparison.Ordinal);

        // …and the upgraded hash still accepts the same password.
        var second = await Client().PostAsync("/v1/auth/login",
            Body($$"""{"username":"{{username}}","password":"coffee123"}"""));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        // Login also backfilled the GSI1 keys, so a pre-rework account is now searchable.
        var lookup = await Fixture.Dynamo.GetItemAsync(new GetItemRequest
        {
            TableName = Fixture.TableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["PK"] = new() { S = $"USERNAME#{username}" },
                ["SK"] = new() { S = "USERNAME" },
            },
        });
        Assert.Equal("USERNAME", lookup.Item["GSI1PK"].S);
        Assert.Equal(username, lookup.Item["GSI1SK"].S);
    }

    [SkippableTheory]
    [InlineData("""{"username":"ab","displayName":"Too Short","password":"coffee123"}""")]
    [InlineData("""{"username":"has spaces","displayName":"Bad","password":"coffee123"}""")]
    [InlineData("""{"username":"validname","displayName":"Bad","password":"12345"}""")]
    [InlineData("""{"username":"validname","displayName":"","password":"coffee123"}""")]
    public async Task Invalid_registrations_are_rejected(string body)
    {
        RequireInfrastructure();

        var response = await Client().PostAsync("/v1/auth/register", Body(body));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
