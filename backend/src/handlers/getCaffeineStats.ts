import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, serverError } from '../lib/response.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.pathParameters?.userId;
    if (!userId) return badRequest('userId is required');

    const todayPrefix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Query today's ratings for caffeine sum
    const todayRatings = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':start': `RATING#${todayPrefix}`,
          ':end': `RATING#${todayPrefix}\uffff`,
        },
      })
    );

    const todayMg = (todayRatings.Items || []).reduce(
      (sum, item) => sum + ((item.caffeineMg as number) || 0),
      0,
    );

    // Read totalCaffeineMg from user profile
    const profile = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        ProjectionExpression: 'totalCaffeineMg',
      })
    );

    const totalMg = (profile.Item?.totalCaffeineMg as number) || 0;

    return ok({ todayMg, totalMg });
  } catch (err) {
    return serverError(err);
  }
}
