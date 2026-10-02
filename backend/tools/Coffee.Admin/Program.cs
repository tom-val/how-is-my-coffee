using Amazon;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Runtime;
using Amazon.S3;
using Coffee.Api.Features.Account;
using Coffee.Api.Features.Ratings;
using Coffee.Api.Shared.Auth;
using Coffee.Api.Shared.Data;
using Coffee.Api.Shared.Storage;
using Microsoft.Extensions.Configuration;

// Operator commands against the CoffeeApp table. There is no self-service password reset (accounts
// have no e-mail), so this is how a password gets set by hand. Two ways in:
//
//   set-password <username> <password> [--table CoffeeApp] [--region eu-west-1] [--endpoint URL]
//       Writes the hash straight into DynamoDB using the AWS default credential chain (profile,
//       env vars, SSO). `--endpoint http://localhost:8000` targets DynamoDB Local.
//
//   hash-password <password>
//       Prints only the hash plus the aws CLI command to apply it — for when the credentials live
//       somewhere without .NET, e.g. CloudShell.
//
// Both use the API's own PasswordHasher, so the result is exactly what /v1/auth/login verifies.

var args0 = args.ToList();
if (args0.Count == 0)
{
    Console.Error.WriteLine("usage: Coffee.Admin set-password <username> <password> [--table T] [--region R] [--endpoint URL]");
    Console.Error.WriteLine("       Coffee.Admin hash-password <password>");
    Console.Error.WriteLine("       Coffee.Admin backfill-indexes [--table T] [--region R] [--endpoint URL]");
    Console.Error.WriteLine("       Coffee.Admin delete-account <username> [--bucket B] [--table T] [--region R] [--endpoint URL]");
    return 2;
}

string? Opt(string name)
{
    var i = args0.IndexOf(name);
    if (i < 0 || i + 1 >= args0.Count) return null;
    var value = args0[i + 1];
    args0.RemoveRange(i, 2);
    return value;
}

var table = Opt("--table") ?? Environment.GetEnvironmentVariable("Dynamo__TableName") ?? "CoffeeApp";
var region = Opt("--region") ?? Environment.GetEnvironmentVariable("AWS_REGION") ?? "eu-west-1";
var endpoint = Opt("--endpoint") ?? Environment.GetEnvironmentVariable("Dynamo__ServiceUrl");
var bucketOpt = Opt("--bucket") ?? Environment.GetEnvironmentVariable("Photos__Bucket");

switch (args0[0])
{
    case "hash-password":
        {
            if (args0.Count != 2) return Usage("hash-password <password>");
            var hash = PasswordHasher.Hash(args0[1]);
            Console.WriteLine(hash);
            Console.WriteLine();
            Console.WriteLine("Apply it (replace <userId> with the id from USERNAME#<username>):");
            Console.WriteLine($"  aws dynamodb get-item --table-name {table} --key '{{\"PK\":{{\"S\":\"USERNAME#<username>\"}},\"SK\":{{\"S\":\"USERNAME\"}}}}' --query Item.userId.S --output text");
            Console.WriteLine($"  aws dynamodb update-item --table-name {table} --key '{{\"PK\":{{\"S\":\"USER#<userId>\"}},\"SK\":{{\"S\":\"PROFILE\"}}}}' \\");
            Console.WriteLine($"    --update-expression 'SET passwordHash = :h' --expression-attribute-values '{{\":h\":{{\"S\":\"{hash}\"}}}}'");
            return 0;
        }
    case "set-password":
        {
            if (args0.Count != 3) return Usage("set-password <username> <password> [--table T] [--region R] [--endpoint URL]");
            var username = UserDirectory.Normalize(args0[1]);
            var password = args0[2];
            if (password.Length is < 6 or > 100)
            {
                Console.Error.WriteLine("password must be 6-100 characters (the same rule as sign-up)");
                return 2;
            }

            using var client = CreateClient(region, endpoint);

            var lookup = await client.GetItemAsync(new GetItemRequest
            {
                TableName = table,
                Key = new Dictionary<string, AttributeValue>
                {
                    [Attr.Pk] = new(Keys.UsernameLookup(username)),
                    [Attr.Sk] = new(Keys.UsernameSk),
                },
            });
            if (lookup.Item is null || !lookup.Item.TryGetValue(Attr.UserId, out var userIdAttr))
            {
                Console.Error.WriteLine($"no user '{username}' in table {table} ({region})");
                return 1;
            }
            var userId = userIdAttr.S;

            await client.UpdateItemAsync(new UpdateItemRequest
            {
                TableName = table,
                Key = new Dictionary<string, AttributeValue>
                {
                    [Attr.Pk] = new(Keys.User(userId)),
                    [Attr.Sk] = new(Keys.ProfileSk),
                },
                UpdateExpression = "SET passwordHash = :h",
                ConditionExpression = "attribute_exists(PK)",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    [":h"] = new(PasswordHasher.Hash(password)),
                },
            });
            Console.WriteLine($"password set for {username} ({userId}) in {table} ({region}). Existing sessions stay signed in.");
            return 0;
        }
    case "backfill-indexes":
        {
            // Rows written by the pre-rework Node backend predate GSI1. The API self-heals a place
            // when it is rated again and a user when they log in, but until then Discover (GSI1PK=
            // "PLACE") and username search (GSI1PK="USERNAME") cannot see them. One scan fixes all of
            // it; idempotent — rows that already carry the keys are left alone.
            using var client = CreateClient(region, endpoint);
            var scanned = 0; var places = 0; var users = 0;
            Dictionary<string, AttributeValue>? startKey = null;
            do
            {
                var page = await client.ScanAsync(new ScanRequest
                {
                    TableName = table,
                    ProjectionExpression = "PK, SK, GSI1PK, placeId, username",
                    ExclusiveStartKey = startKey,
                });
                foreach (var item in page.Items)
                {
                    scanned++;
                    if (item.ContainsKey(Attr.Gsi1Pk)) continue;
                    var pk = item[Attr.Pk].S;
                    var sk = item[Attr.Sk].S;
                    string? indexPk = null, indexSk = null;
                    if (sk == Keys.MetaSk && pk.StartsWith(Keys.PlacePrefix, StringComparison.Ordinal))
                    {
                        indexPk = Keys.PlaceIndexPk;
                        indexSk = item.TryGetValue(Attr.PlaceId, out var pid) ? pid.S : pk[Keys.PlacePrefix.Length..];
                    }
                    else if (sk == Keys.UsernameSk && pk.StartsWith("USERNAME#", StringComparison.Ordinal))
                    {
                        indexPk = Keys.UsernameIndexPk;
                        indexSk = item.TryGetValue(Attr.Username, out var u) ? u.S : pk["USERNAME#".Length..];
                    }
                    if (indexPk is null || string.IsNullOrEmpty(indexSk)) continue;

                    await client.UpdateItemAsync(new UpdateItemRequest
                    {
                        TableName = table,
                        Key = new Dictionary<string, AttributeValue> { [Attr.Pk] = new(pk), [Attr.Sk] = new(sk) },
                        UpdateExpression = "SET GSI1PK = if_not_exists(GSI1PK, :pk), GSI1SK = if_not_exists(GSI1SK, :sk)",
                        ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                        {
                            [":pk"] = new(indexPk),
                            [":sk"] = new(indexSk),
                        },
                    });
                    if (indexPk == Keys.PlaceIndexPk) places++; else users++;
                }
                startKey = page.LastEvaluatedKey is { Count: > 0 } ? page.LastEvaluatedKey : null;
            } while (startKey is not null);

            Console.WriteLine($"scanned {scanned} item(s) in {table} ({region}): indexed {places} place(s) and {users} username(s) that were missing GSI1 keys.");
            return 0;
        }
    case "delete-account":
        {
            // Operator-side account deletion for people who cannot sign in (the Support and
            // delete-account pages promise this by e-mail). Runs exactly the same AccountDeleter as
            // DELETE /v1/me, so the result is identical; there is no password check — the operator
            // has verified the request. Idempotent, like the endpoint.
            if (args0.Count != 2) return Usage("delete-account <username> [--bucket B] [--table T] [--region R] [--endpoint URL]");
            var bucket = bucketOpt;
            if (string.IsNullOrWhiteSpace(bucket))
            {
                Console.Error.WriteLine("the photos bucket is required (--bucket or Photos__Bucket) so the user's photos are deleted too");
                return 2;
            }
            var username = UserDirectory.Normalize(args0[1]);
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Dynamo:TableName"] = table,
                    ["Photos:Bucket"] = bucket,
                })
                .Build();
            using var dynamo = CreateClient(region, endpoint);
            using var s3 = new AmazonS3Client(RegionEndpoint.GetBySystemName(region));
            var db = new CoffeeDb(dynamo, config);
            var profile = await db.ProfileByUsernameAsync(username, CancellationToken.None);
            if (profile is null)
            {
                Console.Error.WriteLine($"no user '{username}' in table {table} ({region}) — nothing to delete");
                return 1;
            }
            var deleter = new AccountDeleter(db, new RatingStore(db), new S3PhotoStorage(s3, config));
            var summary = await deleter.DeleteAsync(profile, CancellationToken.None);
            Console.WriteLine($"deleted account '{username}': {summary}");
            return 0;
        }
    default:
        return Usage($"unknown command '{args0[0]}'");
}

static int Usage(string message)
{
    Console.Error.WriteLine(message);
    return 2;
}

static AmazonDynamoDBClient CreateClient(string region, string? endpoint)
{
    if (string.IsNullOrWhiteSpace(endpoint))
        return new AmazonDynamoDBClient(RegionEndpoint.GetBySystemName(region));
    // DynamoDB Local: any credentials, path-style endpoint.
    return new AmazonDynamoDBClient(
        new BasicAWSCredentials("local", "local"),
        new AmazonDynamoDBConfig { ServiceURL = endpoint, AuthenticationRegion = region });
}
