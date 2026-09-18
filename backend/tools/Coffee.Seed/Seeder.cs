using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;

namespace Coffee.Seed;

/// <summary>
/// Brings a local stack from empty to usable: creates the <c>CoffeeApp</c> table (with GSI1) and the
/// MinIO photo bucket if they are missing, then writes a small, fixed dataset. Idempotent — every
/// write is an overwriting put, so running it twice is the same as running it once.
/// </summary>
public static class Seeder
{
    private const string TableName = "CoffeeApp";
    private const string BucketName = "coffee-app-photos";

    private const string TomasId = "11111111-1111-1111-1111-111111111111";
    private const string LoverId = "22222222-2222-2222-2222-222222222222";

    /// <summary>
    /// A hash in the OLD Node format (<c>scryptSync('coffee123', salt, 64)</c>), on purpose: one
    /// seeded user exercises the legacy-verify-and-upgrade path on every local login test.
    /// </summary>
    private const string LegacyScryptHash =
        "0123456789abcdef0123456789abcdef:12376cc10993d4566e71095e85367db477b56c9efe202de260557f6e5ac70df8d1e17573177baa24275bca129188eaa17ae889c03019e46a7c17b5ef2eb68262";

    public static async Task Main()
    {
        var dynamoUrl = Environment.GetEnvironmentVariable("Dynamo__ServiceUrl") ?? "http://localhost:8000";
        var s3Url = Environment.GetEnvironmentVariable("Photos__ServiceUrl") ?? "http://localhost:9000";

        var dynamo = new AmazonDynamoDBClient(
            new BasicAWSCredentials("local", "local"),
            new AmazonDynamoDBConfig { ServiceURL = dynamoUrl, AuthenticationRegion = "eu-west-1" });

        await EnsureTableAsync(dynamo);
        await EnsureBucketAsync(s3Url);
        await SeedAsync(dynamo);

        Console.WriteLine("Seed complete. Log in as tomas / coffee123 (PBKDF2) or coffee_lover / coffee123 (legacy scrypt).");
    }

    private static async Task EnsureTableAsync(IAmazonDynamoDB dynamo)
    {
        try
        {
            await dynamo.CreateTableAsync(new CreateTableRequest
            {
                TableName = TableName,
                KeySchema =
                [
                    new KeySchemaElement(Attr.Pk, KeyType.HASH),
                    new KeySchemaElement(Attr.Sk, KeyType.RANGE),
                ],
                AttributeDefinitions =
                [
                    new AttributeDefinition(Attr.Pk, ScalarAttributeType.S),
                    new AttributeDefinition(Attr.Sk, ScalarAttributeType.S),
                    new AttributeDefinition(Attr.Gsi1Pk, ScalarAttributeType.S),
                    new AttributeDefinition(Attr.Gsi1Sk, ScalarAttributeType.S),
                ],
                // GSI1 exists for one query: username prefix search (the companion picker).
                GlobalSecondaryIndexes =
                [
                    new GlobalSecondaryIndex
                    {
                        IndexName = "GSI1",
                        KeySchema =
                        [
                            new KeySchemaElement(Attr.Gsi1Pk, KeyType.HASH),
                            new KeySchemaElement(Attr.Gsi1Sk, KeyType.RANGE),
                        ],
                        Projection = new Projection { ProjectionType = ProjectionType.ALL },
                    },
                ],
                BillingMode = BillingMode.PAY_PER_REQUEST,
            });
            Console.WriteLine($"Created table {TableName}");
        }
        catch (ResourceInUseException)
        {
            Console.WriteLine($"Table {TableName} already exists");
        }
    }

    private static async Task EnsureBucketAsync(string serviceUrl)
    {
        Amazon.AWSConfigsS3.UseSignatureVersion4 = true;
        using var s3 = new AmazonS3Client("minioadmin", "minioadmin", new AmazonS3Config
        {
            ServiceURL = serviceUrl,
            ForcePathStyle = true,
            AuthenticationRegion = "eu-west-1",
            // The SDK now adds a CRC32 integrity header to every request by default; MinIO answers
            // "functionality that is not implemented" to it on bucket-level calls.
            RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
        });

        try
        {
            await s3.PutBucketAsync(new PutBucketRequest { BucketName = BucketName });
            Console.WriteLine($"Created bucket {BucketName}");
        }
        catch (AmazonS3Exception ex) when (ex.ErrorCode is "BucketAlreadyOwnedByYou" or "BucketAlreadyExists")
        {
            Console.WriteLine($"Bucket {BucketName} already exists");
        }

        // Photo URLs are plain GETs from the app, so locally the bucket has to be world-readable —
        // the same role CloudFront's /uploads/* behaviour plays in production.
        await s3.PutBucketPolicyAsync(new PutBucketPolicyRequest
        {
            BucketName = BucketName,
            Policy = $$"""
                {
                  "Version": "2012-10-17",
                  "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": ["arn:aws:s3:::{{BucketName}}/*"]
                  }]
                }
                """,
        });

        // Note: there is no per-bucket CORS call here. MinIO does not implement the S3 bucket-CORS
        // API (it answers NotImplemented) and configures CORS server-wide instead — see
        // MINIO_API_CORS_ALLOW_ORIGIN in docker-compose.yml.
    }

    private static async Task SeedAsync(IAmazonDynamoDB dynamo)
    {
        var items = new List<Dictionary<string, AttributeValue>>();

        items.Add(Profile(TomasId, "tomas", "Tomas", PasswordHasher.Hash("coffee123"), 323, "2025-01-01T00:00:00.000Z"));
        items.Add(UsernameLookup(TomasId, "tomas"));
        items.Add(Profile(LoverId, "coffee_lover", "Coffee Lover", LegacyScryptHash, 130, "2025-01-02T00:00:00.000Z"));
        items.Add(UsernameLookup(LoverId, "coffee_lover"));

        // tomas follows coffee_lover (and so appears in coffee_lover's followers).
        items.Add(new Dictionary<string, AttributeValue>
        {
            [Attr.Pk] = Av.S(Keys.User(TomasId)),
            [Attr.Sk] = Av.S(Keys.FriendSk(LoverId)),
            [Attr.FriendUserId] = Av.S(LoverId),
            [Attr.FriendUsername] = Av.S("coffee_lover"),
            [Attr.FriendDisplayName] = Av.S("Coffee Lover"),
            [Attr.AddedAt] = Av.S("2025-01-03T00:00:00.000Z"),
            [Attr.EntityType] = Av.S("Friend"),
        });
        items.Add(new Dictionary<string, AttributeValue>
        {
            [Attr.Pk] = Av.S(Keys.User(LoverId)),
            [Attr.Sk] = Av.S(Keys.FollowerSk(TomasId)),
            [Attr.FollowerUserId] = Av.S(TomasId),
            [Attr.FollowerUsername] = Av.S("tomas"),
            [Attr.FollowerDisplayName] = Av.S("Tomas"),
            [Attr.FollowedAt] = Av.S("2025-01-03T00:00:00.000Z"),
            [Attr.EntityType] = Av.S("Follower"),
        });

        var nero = new SeedPlace("place_cafe_nero", "Caffe Nero", 54.6872, 25.2797, "Gedimino pr. 9, Vilnius");
        var vero = new SeedPlace("place_vero_cafe", "Vero Cafe", 54.6892, 25.2800, "Pilies g. 12, Vilnius");

        var ratings = new List<SeedRating>
        {
            new("r1", TomasId, "tomas", nero, 4.5, "Flat White", "Excellent flat white, smooth and creamy", 130,
                "2025-01-10T09:00:00.000Z", []),
            new("r2", TomasId, "tomas", vero, 3.5, "Cappuccino", "Good cappuccino but a bit lukewarm", 130,
                "2025-01-15T10:30:00.000Z", []),
            new("r4", LoverId, "coffee_lover", nero, 4, "Latte", "Reliable latte, friendly staff", 130,
                "2025-01-20T14:00:00.000Z", []),
            // The companions showcase: one registered user (tagged) and one guest.
            new("r3", TomasId, "tomas", nero, 5, "Espresso", "The best espresso I have ever had!", 63,
                "2025-02-01T08:00:00.000Z",
                [
                    new SeedCompanion(LoverId, "coffee_lover", "Coffee Lover"),
                    new SeedCompanion(null, null, "Guest Anna"),
                ]),
        };

        foreach (var rating in ratings) items.AddRange(rating.ToItems());

        // Latest rating per user: Caffe Nero → tomas 5 + coffee_lover 4 = 4.5 (2); Vero → 3.5 (1).
        items.Add(nero.ToItem(4.5, 2));
        items.Add(vero.ToItem(3.5, 1));

        items.Add(UserPlace(TomasId, nero, "2025-02-01T08:00:00.000Z", 2));
        items.Add(UserPlace(TomasId, vero, "2025-01-15T10:30:00.000Z", 1));
        items.Add(UserPlace(LoverId, nero, "2025-01-20T14:00:00.000Z", 1));

        foreach (var item in items)
        {
            await dynamo.PutItemAsync(new PutItemRequest { TableName = TableName, Item = item });
        }
        Console.WriteLine($"Wrote {items.Count} items");
    }

    private static Dictionary<string, AttributeValue> Profile(
        string userId, string username, string displayName, string passwordHash, int totalCaffeineMg, string createdAt) =>
        new()
        {
            [Attr.Pk] = Av.S(Keys.User(userId)),
            [Attr.Sk] = Av.S(Keys.ProfileSk),
            [Attr.UserId] = Av.S(userId),
            [Attr.Username] = Av.S(username),
            [Attr.DisplayName] = Av.S(displayName),
            [Attr.PasswordHash] = Av.S(passwordHash),
            [Attr.TotalCaffeineMg] = Av.N(totalCaffeineMg),
            [Attr.CreatedAt] = Av.S(createdAt),
            [Attr.EntityType] = Av.S("User"),
        };

    private static Dictionary<string, AttributeValue> UsernameLookup(string userId, string username) =>
        new()
        {
            [Attr.Pk] = Av.S(Keys.UsernameLookup(username)),
            [Attr.Sk] = Av.S(Keys.UsernameSk),
            [Attr.UserId] = Av.S(userId),
            [Attr.Username] = Av.S(username),
            [Attr.EntityType] = Av.S("UsernameIndex"),
            [Attr.Gsi1Pk] = Av.S(Keys.UsernameIndexPk),
            [Attr.Gsi1Sk] = Av.S(username),
        };

    private static Dictionary<string, AttributeValue> UserPlace(
        string userId, SeedPlace place, string lastVisited, int visitCount) =>
        new()
        {
            [Attr.Pk] = Av.S(Keys.User(userId)),
            [Attr.Sk] = Av.S(Keys.UserPlaceSk(place.PlaceId)),
            [Attr.PlaceId] = Av.S(place.PlaceId),
            [Attr.PlaceName] = Av.S(place.Name),
            [Attr.Lat] = Av.N(place.Lat),
            [Attr.Lng] = Av.N(place.Lng),
            [Attr.Address] = Av.S(place.Address),
            [Attr.LastVisited] = Av.S(lastVisited),
            [Attr.VisitCount] = Av.N(visitCount),
            [Attr.EntityType] = Av.S("UserPlace"),
        };

    private sealed record SeedPlace(string PlaceId, string Name, double Lat, double Lng, string Address)
    {
        public Dictionary<string, AttributeValue> ToItem(double avgRating, int ratingCount) => new()
        {
            [Attr.Pk] = Av.S(Keys.Place(PlaceId)),
            [Attr.Sk] = Av.S(Keys.MetaSk),
            [Attr.PlaceId] = Av.S(PlaceId),
            [Attr.Name] = Av.S(Name),
            [Attr.Lat] = Av.N(Lat),
            [Attr.Lng] = Av.N(Lng),
            [Attr.Address] = Av.S(Address),
            [Attr.AvgRating] = Av.N(avgRating),
            [Attr.RatingCount] = Av.N(ratingCount),
            [Attr.EntityType] = Av.S("Place"),
        };
    }

    private sealed record SeedCompanion(string? UserId, string? Username, string DisplayName);

    private sealed record SeedRating(
        string RatingId, string UserId, string Username, SeedPlace Place, double Stars, string DrinkName,
        string Description, int CaffeineMg, string CreatedAt, IReadOnlyList<SeedCompanion> Companions)
    {
        /// <summary>The three denormalised copies plus a TAGGED# pointer per registered companion.</summary>
        public IEnumerable<Dictionary<string, AttributeValue>> ToItems()
        {
            var sk = Keys.RatingSk(CreatedAt, RatingId);
            yield return Copy(Keys.User(UserId), sk, "Rating");
            yield return Copy(Keys.Place(Place.PlaceId), sk, "PlaceRating");
            yield return Copy(Keys.Rating(RatingId), Keys.MetaSk, "RatingMeta");

            foreach (var companion in Companions.Where(c => c.UserId is not null))
            {
                yield return new Dictionary<string, AttributeValue>
                {
                    [Attr.Pk] = Av.S(Keys.User(companion.UserId!)),
                    [Attr.Sk] = Av.S(Keys.TaggedSk(CreatedAt, RatingId)),
                    [Attr.RatingId] = Av.S(RatingId),
                    [Attr.AuthorUserId] = Av.S(UserId),
                    [Attr.CreatedAt] = Av.S(CreatedAt),
                    [Attr.EntityType] = Av.S("Tagged"),
                };
            }
        }

        private Dictionary<string, AttributeValue> Copy(string pk, string sk, string entityType) => new()
        {
            [Attr.Pk] = Av.S(pk),
            [Attr.Sk] = Av.S(sk),
            [Attr.RatingId] = Av.S(RatingId),
            [Attr.UserId] = Av.S(UserId),
            [Attr.Username] = Av.S(Username),
            [Attr.PlaceId] = Av.S(Place.PlaceId),
            [Attr.PlaceName] = Av.S(Place.Name),
            [Attr.Stars] = Av.N(Stars),
            [Attr.DrinkName] = Av.S(DrinkName),
            [Attr.Description] = Av.S(Description),
            [Attr.Lat] = Av.N(Place.Lat),
            [Attr.Lng] = Av.N(Place.Lng),
            [Attr.Address] = Av.S(Place.Address),
            [Attr.CaffeineMg] = Av.N(CaffeineMg),
            [Attr.LikeCount] = Av.N(0),
            [Attr.CommentCount] = Av.N(0),
            [Attr.Companions] = Av.L(
            [
                .. Companions.Select(c =>
                {
                    var map = new Dictionary<string, AttributeValue> { [Attr.DisplayName] = Av.S(c.DisplayName) };
                    map.PutIfPresent(Attr.UserId, c.UserId);
                    map.PutIfPresent(Attr.Username, c.Username);
                    return Av.M(map);
                }),
            ]),
            [Attr.CreatedAt] = Av.S(CreatedAt),
            [Attr.EntityType] = Av.S(entityType),
        };
    }
}
