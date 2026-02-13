import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { created, badRequest, notFound, serverError } from '../lib/response.js';

const CreateCommentSchema = z.object({
  text: z.string().min(1).max(500),
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const currentUserId = event.headers['x-user-id'];
    if (!currentUserId) return badRequest('Missing x-user-id header');

    const ratingId = event.pathParameters?.ratingId;
    if (!ratingId) return badRequest('ratingId is required');

    const body = JSON.parse(event.body || '{}');
    const parsed = CreateCommentSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    const { text } = parsed.data;

    // Read rating META to verify rating exists and get SK data
    const metaResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `RATING#${ratingId}`, SK: 'META' },
      })
    );
    if (!metaResult.Item) return notFound('Rating not found');

    const meta = metaResult.Item;
    const ratingOwnerUserId = meta.userId as string;
    const placeId = meta.placeId as string;
    const createdAt = meta.createdAt as string;
    const ratingSK = `RATING#${createdAt}#${ratingId}`;

    // Fetch current user profile for username/displayName
    const profileResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${currentUserId}`, SK: 'PROFILE' },
      })
    );
    const username = (profileResult.Item?.username as string) || '';
    const displayName = (profileResult.Item?.displayName as string) || username;

    const commentId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Write comment item
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `RATING#${ratingId}`,
          SK: `COMMENT#${timestamp}#${commentId}`,
          commentId,
          userId: currentUserId,
          username,
          displayName,
          text,
          createdAt: timestamp,
          entityType: 'Comment',
        },
      })
    );

    // Increment commentCount on META, user rating, and place rating
    await Promise.all([
      dynamo.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `RATING#${ratingId}`, SK: 'META' },
          UpdateExpression: 'ADD commentCount :inc',
          ExpressionAttributeValues: { ':inc': 1 },
        })
      ),
      dynamo.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${ratingOwnerUserId}`, SK: ratingSK },
          UpdateExpression: 'ADD commentCount :inc',
          ExpressionAttributeValues: { ':inc': 1 },
        })
      ),
      dynamo.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `PLACE#${placeId}`, SK: ratingSK },
          UpdateExpression: 'ADD commentCount :inc',
          ExpressionAttributeValues: { ':inc': 1 },
        })
      ),
    ]);

    return created({ commentId, createdAt: timestamp });
  } catch (err) {
    return serverError(err);
  }
}
