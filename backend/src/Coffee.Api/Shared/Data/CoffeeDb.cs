using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;

namespace Coffee.Api.Shared.Data;

/// <summary>
/// Thin wrapper over the low-level DynamoDB client: it owns the table name and hides the request
/// plumbing the feature code repeats (get / query-all / put / update / delete / batch-get).
/// Deliberately low-level — the document and object-persistence models both rely on reflection the
/// Native AOT compiler cannot see through.
/// </summary>
public sealed class CoffeeDb(IAmazonDynamoDB client, IConfiguration config)
{
    public string TableName { get; } = config["Dynamo:TableName"] ?? "CoffeeApp";
    public IAmazonDynamoDB Client { get; } = client;

    public static Dictionary<string, AttributeValue> Key(string pk, string sk) =>
        new() { [Attr.Pk] = Av.S(pk), [Attr.Sk] = Av.S(sk) };

    public async Task<Dictionary<string, AttributeValue>?> GetAsync(
        string pk, string sk, CancellationToken ct, params string[] projection)
    {
        var request = new GetItemRequest { TableName = TableName, Key = Key(pk, sk) };
        if (projection.Length > 0) request.ProjectionExpression = string.Join(", ", projection);

        var response = await Client.GetItemAsync(request, ct);
        return response.IsItemSet ? response.Item : null;
    }

    /// <summary>All items of a partition whose SK starts with <paramref name="skPrefix"/> (paged through to the end).</summary>
    public Task<List<Dictionary<string, AttributeValue>>> QueryPrefixAsync(
        string pk, string skPrefix, CancellationToken ct, bool ascending = true) =>
        QueryAllAsync(new QueryRequest
        {
            TableName = TableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = Av.S(pk),
                [":sk"] = Av.S(skPrefix),
            },
            ScanIndexForward = ascending,
        }, ct);

    /// <summary>Every item of a partition, regardless of SK (used for the rating detail fan-in).</summary>
    public Task<List<Dictionary<string, AttributeValue>>> QueryPartitionAsync(string pk, CancellationToken ct) =>
        QueryAllAsync(new QueryRequest
        {
            TableName = TableName,
            KeyConditionExpression = "PK = :pk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue> { [":pk"] = Av.S(pk) },
        }, ct);

    /// <summary>Runs a query to exhaustion. Only used where the result set is bounded (one place, one rating, one user's friends).</summary>
    public async Task<List<Dictionary<string, AttributeValue>>> QueryAllAsync(QueryRequest request, CancellationToken ct)
    {
        var items = new List<Dictionary<string, AttributeValue>>();
        do
        {
            var response = await Client.QueryAsync(request, ct);
            items.AddRange(response.Items);
            request.ExclusiveStartKey = response.LastEvaluatedKey is { Count: > 0 } ? response.LastEvaluatedKey : null;
        }
        while (request.ExclusiveStartKey is not null);
        return items;
    }

    /// <summary>One page of a query — the caller turns <c>LastEvaluatedKey</c> into the opaque cursor.</summary>
    public Task<QueryResponse> QueryPageAsync(QueryRequest request, CancellationToken ct) =>
        Client.QueryAsync(request, ct);

    public Task PutAsync(Dictionary<string, AttributeValue> item, CancellationToken ct) =>
        Client.PutItemAsync(new PutItemRequest { TableName = TableName, Item = item }, ct);

    public Task DeleteAsync(string pk, string sk, CancellationToken ct) =>
        Client.DeleteItemAsync(new DeleteItemRequest { TableName = TableName, Key = Key(pk, sk) }, ct);

    public Task UpdateAsync(
        string pk, string sk, string updateExpression,
        Dictionary<string, AttributeValue> values, CancellationToken ct,
        Dictionary<string, string>? names = null) =>
        Client.UpdateItemAsync(new UpdateItemRequest
        {
            TableName = TableName,
            Key = Key(pk, sk),
            UpdateExpression = updateExpression,
            ExpressionAttributeValues = values,
            ExpressionAttributeNames = names,
        }, ct);

    public Task TransactWriteAsync(List<TransactWriteItem> items, CancellationToken ct) =>
        Client.TransactWriteItemsAsync(new TransactWriteItemsRequest { TransactItems = items }, ct);

    public TransactWriteItem PutTransact(Dictionary<string, AttributeValue> item) =>
        new() { Put = new Put { TableName = TableName, Item = item } };

    /// <summary>
    /// Batch-get up to 100 keys at a time, retrying unprocessed keys. Returns whatever came back —
    /// callers treat a missing item as "not there" (that is how the like lookup works).
    /// </summary>
    public async Task<List<Dictionary<string, AttributeValue>>> BatchGetAsync(
        List<Dictionary<string, AttributeValue>> keys, CancellationToken ct, params string[] projection)
    {
        var results = new List<Dictionary<string, AttributeValue>>();
        foreach (var chunk in keys.Chunk(100))
        {
            var pending = new KeysAndAttributes { Keys = [.. chunk] };
            if (projection.Length > 0) pending.ProjectionExpression = string.Join(", ", projection);

            while (true)
            {
                var response = await Client.BatchGetItemAsync(new BatchGetItemRequest
                {
                    RequestItems = new Dictionary<string, KeysAndAttributes> { [TableName] = pending },
                }, ct);

                if (response.Responses.TryGetValue(TableName, out var got)) results.AddRange(got);

                if (response.UnprocessedKeys is null
                    || !response.UnprocessedKeys.TryGetValue(TableName, out var retry)
                    || retry.Keys.Count == 0)
                {
                    break;
                }
                pending = retry;
            }
        }
        return results;
    }

    /// <summary>Best-effort delete of many items (rating teardown). Batches of 25, the API maximum.</summary>
    public async Task BatchDeleteAsync(List<Dictionary<string, AttributeValue>> keys, CancellationToken ct)
    {
        foreach (var chunk in keys.Chunk(25))
        {
            var writes = chunk
                .Select(k => new WriteRequest { DeleteRequest = new DeleteRequest { Key = k } })
                .ToList();
            await Client.BatchWriteItemAsync(new BatchWriteItemRequest
            {
                RequestItems = new Dictionary<string, List<WriteRequest>> { [TableName] = writes },
            }, ct);
        }
    }
}
