import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, serverError } from '../lib/response.js';
import { getPhotoUrl } from '../lib/s3.js';
import { parsePaginationParams, encodeCursor } from '../lib/pagination.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.pathParameters?.userId;
    if (!userId) return badRequest('userId is required');

    const { limit, exclusiveStartKey } = parsePaginationParams(event);

    const result = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'RATING#',
        },
        ScanIndexForward: false,
        Limit: limit,
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      })
    );

    const ratings = (result.Items || []).map((item) => {
      const { PK, SK, entityType, ...rating } = item;
      if (rating.photoKey) {
        rating.photoUrl = getPhotoUrl(rating.photoKey as string);
      }
      return rating;
    });

    return ok({
      ratings,
      nextCursor: encodeCursor(result.LastEvaluatedKey as Record<string, unknown> | undefined),
    });
  } catch (err) {
    return serverError(err);
  }
}
