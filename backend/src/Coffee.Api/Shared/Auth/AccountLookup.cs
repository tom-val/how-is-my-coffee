using Amazon.DynamoDBv2.Model;
using Coffee.Api.Shared.Data;

namespace Coffee.Api.Shared.Auth;

/// <summary>
/// "Does this user still exist?" — asked once per authenticated request by <see cref="AuthMiddleware"/>.
/// Tokens are stateless and live 30 days, so without this a deleted account's token would keep
/// working against every endpoint that does not happen to load the profile. An interface so the
/// DynamoDB-free unit tests can swap it out.
/// </summary>
public interface IAccountLookup
{
    Task<bool> ExistsAsync(string userId, CancellationToken ct);
}

/// <summary>
/// One strongly consistent <c>GetItem</c> on <c>USER#&lt;id&gt;/PROFILE</c>, projected to the key: 1 read
/// unit and a few milliseconds per authenticated request. Strongly consistent because the app calls
/// the API the instant <c>register</c> returns, and an eventually consistent miss there would sign a
/// brand-new user straight back out.
/// </summary>
public sealed class DynamoAccountLookup(CoffeeDb db) : IAccountLookup
{
    public async Task<bool> ExistsAsync(string userId, CancellationToken ct)
    {
        var response = await db.Client.GetItemAsync(new GetItemRequest
        {
            TableName = db.TableName,
            Key = CoffeeDb.Key(Keys.User(userId), Keys.ProfileSk),
            ProjectionExpression = Attr.Pk,
            ConsistentRead = true,
        }, ct);
        return response.IsItemSet;
    }
}
