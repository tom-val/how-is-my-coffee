import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, serverError } from '../lib/response.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.pathParameters?.userId;
    if (!userId) return badRequest('userId is required');

    const result = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'FRIEND#',
        },
      })
    );

    const friends = (result.Items || []).map((item) => {
      const { PK, SK, entityType, ...friend } = item;
      return friend;
    });

    return ok({ friends });
  } catch (err) {
    return serverError(err);
  }
}
