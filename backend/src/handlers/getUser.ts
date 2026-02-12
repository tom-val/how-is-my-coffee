import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, notFound, badRequest, serverError } from '../lib/response.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const username = event.pathParameters?.username;
    if (!username) return badRequest('Username is required');

    const usernameLower = username.toLowerCase();

    // Lookup userId by username
    const usernameResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USERNAME#${usernameLower}`, SK: 'USERNAME' },
      })
    );
    if (!usernameResult.Item) return notFound('User not found');

    const userId = usernameResult.Item.userId as string;

    // Get user profile
    const profileResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    if (!profileResult.Item) return notFound('User profile not found');

    const { PK, SK, entityType, passwordHash, ...user } = profileResult.Item;
    return ok(user);
  } catch (err) {
    return serverError(err);
  }
}
