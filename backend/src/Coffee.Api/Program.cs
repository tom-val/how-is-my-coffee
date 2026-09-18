using Amazon.DynamoDBv2;
using Amazon.Lambda.AspNetCoreServer;
using Amazon.Lambda.Serialization.SystemTextJson;
using Amazon.Runtime;
using Amazon.S3;
using Coffee.Api.Features.Auth;
using Coffee.Api.Features.Caffeine;
using Coffee.Api.Features.Feed;
using Coffee.Api.Features.Friends;
using Coffee.Api.Features.Health;
using Coffee.Api.Features.Photos;
using Coffee.Api.Features.Places;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Features.Users;
using Coffee.Api.Shared;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Caffeine;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Middleware;
using Coffee.Api.Shared.Places;
using Coffee.Api.Shared.Serialization;
using Coffee.Api.Shared.Storage;

var builder = WebApplication.CreateSlimBuilder(args);

// Gitignored, optional, and last of the JSON sources so it wins: somewhere for local secrets
// (Google:PlacesApiKey, OpenAi:ApiKey) that must not land in appsettings.Development.json. In
// Lambda the same keys arrive as `Google__PlacesApiKey`-style environment variables.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);

var isDevelopment = builder.Environment.IsDevelopment();

// Structured JSON logging inside Lambda (queryable in CloudWatch); readable console in dev.
if (!isDevelopment)
{
    builder.Logging.AddJsonConsole(o => o.IncludeScopes = true);
}

// In dev the API, MinIO and the phone are three different hosts: "localhost" in a presigned URL or
// a photo URL points the phone at itself. Rewrite both to this machine's current LAN IP, resolved
// per start so changing Wi-Fi needs no config edit.
if (isDevelopment && LocalNetwork.PrimaryIPv4() is { } lanIp)
{
    var overrides = new Dictionary<string, string?>();
    foreach (var key in (string[])["Photos:ServiceUrl", "Photos:PublicBaseUrl"])
    {
        var value = builder.Configuration[key];
        if (string.IsNullOrWhiteSpace(value) || !Uri.TryCreate(value, UriKind.Absolute, out var uri)) continue;
        if (!uri.IsLoopback) continue;
        overrides[key] = new UriBuilder(uri) { Host = lanIp }.Uri.ToString().TrimEnd('/');
    }
    if (overrides.Count > 0) builder.Configuration.AddInMemoryCollection(overrides);
}

// Runs inside Lambda when deployed (HTTP API event source); a no-op locally, so the same binary
// serves `dotnet run`. The source-generated serializer handles the event envelope and
// ConfigureHttpJsonOptions makes minimal-API binding and responses use the same context — together
// that removes every reflection-based System.Text.Json path, which Native AOT forbids.
// AddAWSLambdaHosting is annotated RequiresUnreferencedCode/DynamicCode, but we pass the
// source-generated serializer (the AOT-safe overload), so the reflection path is never taken.
#pragma warning disable IL2026, IL3050
builder.Services.AddAWSLambdaHosting(
    LambdaEventSource.HttpApi,
    options => options.Serializer = new SourceGeneratorLambdaJsonSerializer<ApiJsonSerializerContext>());
#pragma warning restore IL2026, IL3050
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.TypeInfoResolverChain.Insert(0, ApiJsonSerializerContext.Default));

// CORS. Dev is permissive (any origin — we authenticate with a Bearer header, not cookies, so there
// is nothing for a hostile page to ride on); production restricts to the configured origins.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(policy =>
{
    if (isDevelopment) policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    else policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
}));

// DynamoDB. `Dynamo:ServiceUrl` points at DynamoDB Local in dev/tests (which needs *some* credentials
// but validates none); in Lambda the default client picks up the execution role and region.
var dynamoServiceUrl = builder.Configuration["Dynamo:ServiceUrl"];
builder.Services.AddSingleton<IAmazonDynamoDB>(_ => string.IsNullOrWhiteSpace(dynamoServiceUrl)
    ? new AmazonDynamoDBClient()
    : new AmazonDynamoDBClient(
        new BasicAWSCredentials("local", "local"),
        new AmazonDynamoDBConfig { ServiceURL = dynamoServiceUrl, AuthenticationRegion = "eu-west-1" }));

// S3 (MinIO locally). Path-style addressing because MinIO has no per-bucket DNS, and SigV4 so the
// presigned URLs keep the endpoint's scheme (local stays http).
var photoServiceUrl = builder.Configuration["Photos:ServiceUrl"];
if (!string.IsNullOrWhiteSpace(photoServiceUrl))
{
    Amazon.AWSConfigsS3.UseSignatureVersion4 = true;
    var s3Config = new AmazonS3Config
    {
        ServiceURL = photoServiceUrl,
        ForcePathStyle = true,
        AuthenticationRegion = builder.Configuration["Photos:Region"] ?? "eu-west-1",
    };
    var accessKey = builder.Configuration["Photos:AccessKey"] ?? "minioadmin";
    var secretKey = builder.Configuration["Photos:SecretKey"] ?? "minioadmin";
    builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client(accessKey, secretKey, s3Config));
}
else
{
    builder.Services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client());
}

builder.Services.AddSingleton<CoffeeDb>();
builder.Services.AddSingleton<RatingStore>();
builder.Services.AddSingleton<IPhotoStorage, S3PhotoStorage>();
builder.Services.AddSingleton<JwtIssuer>();
builder.Services.AddScoped<AuthContext>();

// One long-lived HttpClient: the resolver is the only outbound caller and its own timeout bounds
// the request, so the socket-exhaustion argument for IHttpClientFactory does not apply.
builder.Services.AddSingleton<ICaffeineAiResolver>(sp => new OpenAiCaffeineResolver(
    new HttpClient { Timeout = OpenAiCaffeineResolver.Timeout },
    sp.GetRequiredService<IConfiguration>(),
    sp.GetRequiredService<ILogger<OpenAiCaffeineResolver>>()));

// Same deal for the Google Places proxy: one client, its own 5 s budget.
builder.Services.AddSingleton<IGooglePlacesClient>(sp => new GooglePlacesClient(
    new HttpClient { Timeout = GooglePlacesClient.Timeout },
    sp.GetRequiredService<IConfiguration>(),
    sp.GetRequiredService<ILogger<GooglePlacesClient>>()));

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseCors();
app.UseMiddleware<AuthMiddleware>();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapFriendEndpoints();
app.MapRatingEndpoints();
app.MapPlaceEndpoints();
app.MapFeedEndpoints();
app.MapCaffeineEndpoints();
app.MapPhotoEndpoints();

app.Run();

// Exposed for WebApplicationFactory in the test projects.
public partial class Program;
