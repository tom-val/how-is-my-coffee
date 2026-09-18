using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Hosting;
using Coffee.Api.Shared.Push;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Coffee.Api.IntegrationTests;

/// <summary>
/// Boots the real app against DynamoDB Local and MinIO from <c>docker-compose.yml</c>.
/// <para>
/// Each run gets its own throwaway table, so the suite never depends on (or disturbs) seeded data
/// and several runs can share one container. When DynamoDB Local is unreachable the fixture records
/// why and every test skips with that reason rather than failing.
/// </para>
/// </summary>
public sealed class IntegrationFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string DynamoUrl = "http://localhost:8000";
    public const string S3Url = "http://localhost:9000";
    public const string Bucket = "coffee-app-photos";

    public string TableName { get; } = $"CoffeeAppTest{Guid.NewGuid():N}";
    public string? SkipReason { get; private set; }

    private IAmazonDynamoDB? _dynamo;
    private WebApplicationFactory<Program>? _pushHost;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Auth:JwtSecret", "integration-test-secret");
        builder.UseSetting("Dynamo:TableName", TableName);
        builder.UseSetting("Dynamo:ServiceUrl", DynamoUrl);
        builder.UseSetting("Photos:Bucket", Bucket);
        builder.UseSetting("Photos:ServiceUrl", S3Url);
        builder.UseSetting("Photos:PublicBaseUrl", $"{S3Url}/{Bucket}");
        builder.UseSetting("Photos:AccessKey", "minioadmin");
        builder.UseSetting("Photos:SecretKey", "minioadmin");
        // Nothing in this suite should reach exp.host. PushTests opts back in against a capturing
        // sender (see PushHost); everywhere else the notifier is a no-op and costs no extra reads.
        builder.UseSetting("Push:Enabled", "false");
        // appsettings.Local.json (gitignored, a real Google key on a developer machine) is added by
        // Program.cs *after* the host settings, so it would win over UseSetting. Blank the key from a
        // source of our own, appended last, so the suite can never call Google.
        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(
            new Dictionary<string, string?> { ["Google:PlacesApiKey"] = "" }));
    }

    public async Task InitializeAsync()
    {
        _dynamo = new AmazonDynamoDBClient(
            new BasicAWSCredentials("local", "local"),
            new AmazonDynamoDBConfig
            {
                ServiceURL = DynamoUrl,
                AuthenticationRegion = "eu-west-1",
                Timeout = TimeSpan.FromSeconds(3),
                MaxErrorRetry = 0,
            });

        try
        {
            await _dynamo.ListTablesAsync(new ListTablesRequest { Limit = 1 });
        }
        catch (Exception ex)
        {
            SkipReason =
                $"DynamoDB Local is not reachable at {DynamoUrl} ({ex.GetType().Name}). "
                + "Run `make infra` (docker compose up -d) to enable the integration suite.";
            return;
        }

        await _dynamo.CreateTableAsync(new CreateTableRequest
        {
            TableName = TableName,
            KeySchema =
            [
                new KeySchemaElement("PK", KeyType.HASH),
                new KeySchemaElement("SK", KeyType.RANGE),
            ],
            AttributeDefinitions =
            [
                new AttributeDefinition("PK", ScalarAttributeType.S),
                new AttributeDefinition("SK", ScalarAttributeType.S),
                new AttributeDefinition("GSI1PK", ScalarAttributeType.S),
                new AttributeDefinition("GSI1SK", ScalarAttributeType.S),
            ],
            GlobalSecondaryIndexes =
            [
                new GlobalSecondaryIndex
                {
                    IndexName = "GSI1",
                    KeySchema =
                    [
                        new KeySchemaElement("GSI1PK", KeyType.HASH),
                        new KeySchemaElement("GSI1SK", KeyType.RANGE),
                    ],
                    Projection = new Projection { ProjectionType = ProjectionType.ALL },
                },
            ],
            BillingMode = BillingMode.PAY_PER_REQUEST,
        });

        await EnsureBucketAsync();
    }

    private static async Task EnsureBucketAsync()
    {
        Amazon.AWSConfigsS3.UseSignatureVersion4 = true;
        using var s3 = new AmazonS3Client("minioadmin", "minioadmin", new AmazonS3Config
        {
            ServiceURL = S3Url,
            ForcePathStyle = true,
            AuthenticationRegion = "eu-west-1",
            Timeout = TimeSpan.FromSeconds(3),
            MaxErrorRetry = 0,
        });

        try
        {
            await s3.PutBucketAsync(new PutBucketRequest { BucketName = Bucket });
        }
        catch (AmazonS3Exception)
        {
            // Already there (or MinIO is down, in which case only the upload test notices).
        }
    }

    /// <summary>Messages the notifier produced on <see cref="PushHost"/>. Reset per test.</summary>
    public CapturingPushSender PushSender { get; } = new();

    /// <summary>
    /// The same app against the same table, but with push switched on and Expo replaced by
    /// <see cref="PushSender"/>. One host for the whole collection (which xunit runs serially), so
    /// the notification tests share it and simply reset the sender between them.
    /// </summary>
    public WebApplicationFactory<Program> PushHost => _pushHost ??= WithWebHostBuilder(builder =>
    {
        builder.UseSetting("Push:Enabled", "true");
        builder.ConfigureTestServices(services => services.AddSingleton<IPushSender>(PushSender));
    });

    /// <summary>Direct table access, for asserting on rows the API is supposed to have written or removed.</summary>
    public IAmazonDynamoDB Dynamo => _dynamo ?? throw new InvalidOperationException("Fixture not initialized.");

    public new async Task DisposeAsync()
    {
        if (SkipReason is null && _dynamo is not null)
        {
            try
            {
                await _dynamo.DeleteTableAsync(TableName);
            }
            catch (ResourceNotFoundException)
            {
                // Nothing to clean up.
            }
        }
        _dynamo?.Dispose();
        await base.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class IntegrationCollection : ICollectionFixture<IntegrationFixture>
{
    public const string Name = "integration";
}
