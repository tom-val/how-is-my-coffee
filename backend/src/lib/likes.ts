import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from './dynamo.js';

/**
 * Check which ratings from a list have been liked by the given user.
 * Returns an array of ratingIds that the user has liked.
 */
export async function getLikedRatingIds(
  ratingIds: string[],
  userId: string | undefined,
): Promise<string[]> {
  if (!userId || ratingIds.length === 0) return [];

  const result = await dynamo.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: ratingIds.map((id) => ({
            PK: `RATING#${id}`,
            SK: `LIKE#${userId}`,
          })),
          ProjectionExpression: 'PK',
        },
      },
    })
  );

  return (result.Responses?.[TABLE_NAME] || []).map(
    (item) => (item.PK as string).replace('RATING#', ''),
  );
}
