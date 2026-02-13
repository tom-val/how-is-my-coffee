import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, notFound, serverError } from '../lib/response.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const currentUserId = event.headers['x-user-id'];
    if (!currentUserId) return badRequest('Missing x-user-id header');

    const ratingId = event.pathParameters?.ratingId;
    if (!ratingId) return badRequest('ratingId is required');

    // Read rating META to get owner userId, placeId, and createdAt (needed for SK construction)
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

    // Check if current user already liked this rating
    const existingLike = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `RATING#${ratingId}`, SK: `LIKE#${currentUserId}` },
      })
    );

    const isAlreadyLiked = !!existingLike.Item;

    if (isAlreadyLiked) {
      // Unlike: delete LIKE item, decrement counts
      await dynamo.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: `RATING#${ratingId}`, SK: `LIKE#${currentUserId}` },
        })
      );

      // Decrement likeCount on META, user rating, and place rating
      await Promise.all([
        dynamo.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `RATING#${ratingId}`, SK: 'META' },
            UpdateExpression: 'ADD likeCount :dec',
            ExpressionAttributeValues: { ':dec': -1 },
          })
        ),
        dynamo.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${ratingOwnerUserId}`, SK: ratingSK },
            UpdateExpression: 'ADD likeCount :dec',
            ExpressionAttributeValues: { ':dec': -1 },
          })
        ),
        dynamo.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `PLACE#${placeId}`, SK: ratingSK },
            UpdateExpression: 'ADD likeCount :dec',
            ExpressionAttributeValues: { ':dec': -1 },
          })
        ),
      ]);

      const currentCount = (meta.likeCount as number) || 0;
      return ok({ liked: false, likeCount: Math.max(0, currentCount - 1) });
    } else {
      // Like: fetch current user profile, create LIKE item, increment counts
      const profileResult = await dynamo.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${currentUserId}`, SK: 'PROFILE' },
        })
      );
      const username = (profileResult.Item?.username as string) || '';
      const displayName = (profileResult.Item?.displayName as string) || username;

      const now = new Date().toISOString();

      await dynamo.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `RATING#${ratingId}`,
            SK: `LIKE#${currentUserId}`,
            userId: currentUserId,
            username,
            displayName,
            createdAt: now,
            entityType: 'Like',
          },
        })
      );

      // Increment likeCount on META, user rating, and place rating
      await Promise.all([
        dynamo.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `RATING#${ratingId}`, SK: 'META' },
            UpdateExpression: 'ADD likeCount :inc',
            ExpressionAttributeValues: { ':inc': 1 },
          })
        ),
        dynamo.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${ratingOwnerUserId}`, SK: ratingSK },
            UpdateExpression: 'ADD likeCount :inc',
            ExpressionAttributeValues: { ':inc': 1 },
          })
        ),
        dynamo.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `PLACE#${placeId}`, SK: ratingSK },
            UpdateExpression: 'ADD likeCount :inc',
            ExpressionAttributeValues: { ':inc': 1 },
          })
        ),
      ]);

      const currentCount = (meta.likeCount as number) || 0;
      return ok({ liked: true, likeCount: currentCount + 1 });
    }
  } catch (err) {
    return serverError(err);
  }
}
