import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, serverError } from '../lib/response.js';
import { getPhotoUrl } from '../lib/s3.js';
import { getLikedRatingIds } from '../lib/likes.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.headers?.['x-user-id'];
    if (!userId) return badRequest('userId is required');

    const qs = event.queryStringParameters || {};
    let limit = parseInt(qs.limit || '', 10);
    if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    // Timestamp-based cursor: ISO string of the last item's createdAt
    const cursor = qs.cursor || undefined;

    // 1. Get friends list
    const friendsResult = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'FRIEND#',
        },
      })
    );

    const friends = friendsResult.Items || [];
    if (friends.length === 0) {
      return ok({ ratings: [], likedRatingIds: [], nextCursor: null });
    }

    // 2. Fetch each friend's ratings in parallel
    // If cursor provided, only fetch ratings with SK < RATING#<cursor>
    const friendRatingsPromises = friends.map(async (friend) => {
      const expressionValues: Record<string, unknown> = {
        ':pk': `USER#${friend.friendUserId}`,
      };

      let keyCondition: string;
      if (cursor) {
        // SK < RATING#<cursor> to get items older than the cursor timestamp
        keyCondition = 'PK = :pk AND SK BETWEEN :skStart AND :skEnd';
        expressionValues[':skStart'] = 'RATING#';
        // Use a value just before the cursor timestamp to exclude it
        expressionValues[':skEnd'] = `RATING#${cursor}`;
      } else {
        keyCondition = 'PK = :pk AND begins_with(SK, :sk)';
        expressionValues[':sk'] = 'RATING#';
      }

      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: keyCondition,
          ExpressionAttributeValues: expressionValues,
          ScanIndexForward: false,
          Limit: limit,
        })
      );

      return (result.Items || []).map((item) => {
        const { PK, SK, entityType, ...rating } = item;
        if (rating.photoKey) {
          rating.photoUrl = getPhotoUrl(rating.photoKey as string);
        }
        // Attach friend info so the feed shows who rated
        rating.username = friend.friendUsername;
        rating.displayName = friend.friendDisplayName;
        return rating;
      });
    });

    const allRatings = (await Promise.all(friendRatingsPromises)).flat();

    // 3. Sort by createdAt descending (newest first)
    allRatings.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // 4. Slice to limit
    const page = allRatings.slice(0, limit);

    // 5. Determine next cursor
    const nextCursor = page.length === limit && allRatings.length > limit
      ? page[page.length - 1].createdAt as string
      : null;

    const ratingIds = page.map((r) => r.ratingId as string).filter(Boolean);
    const likedRatingIds = await getLikedRatingIds(ratingIds, userId);

    return ok({ ratings: page, likedRatingIds, nextCursor });
  } catch (err) {
    return serverError(err);
  }
}
