import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, notFound, serverError } from '../lib/response.js';
import { getPhotoUrl } from '../lib/s3.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const ratingId = event.pathParameters?.ratingId;
    if (!ratingId) return badRequest('ratingId is required');

    const currentUserId = event.headers?.['x-user-id'] || '';

    // Query all items under RATING#<ratingId> in one call (META + likes + comments)
    const result = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `RATING#${ratingId}`,
        },
      })
    );

    const items = result.Items || [];

    // Separate by SK prefix
    let ratingMeta: Record<string, unknown> | null = null;
    const likes: Array<{ userId: string; username: string; displayName: string }> = [];
    const comments: Array<{
      commentId: string;
      userId: string;
      username: string;
      displayName: string;
      text: string;
      createdAt: string;
    }> = [];

    for (const item of items) {
      const sk = item.SK as string;
      if (sk === 'META') {
        ratingMeta = item;
      } else if (sk.startsWith('LIKE#')) {
        likes.push({
          userId: item.userId as string,
          username: item.username as string,
          displayName: item.displayName as string,
        });
      } else if (sk.startsWith('COMMENT#')) {
        comments.push({
          commentId: item.commentId as string,
          userId: item.userId as string,
          username: item.username as string,
          displayName: item.displayName as string,
          text: item.text as string,
          createdAt: item.createdAt as string,
        });
      }
    }

    if (!ratingMeta) return notFound('Rating not found');

    // Build the rating object from META, stripping DynamoDB keys
    const { PK, SK, entityType, ...rating } = ratingMeta;
    if (rating.photoKey) {
      rating.photoUrl = getPhotoUrl(rating.photoKey as string);
    }

    const isLikedByMe = currentUserId
      ? likes.some((l) => l.userId === currentUserId)
      : false;

    return ok({ rating, likes, comments, isLikedByMe });
  } catch (err) {
    return serverError(err);
  }
}
