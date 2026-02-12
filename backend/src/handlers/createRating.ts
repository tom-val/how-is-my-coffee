import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TransactWriteCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { created, badRequest, serverError } from '../lib/response.js';

const CreateRatingSchema = z.object({
  placeId: z.string().min(1),
  placeName: z.string().min(1).max(200),
  stars: z.number().min(1).max(5).multipleOf(0.5),
  drinkName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  photoKey: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().max(300).optional(),
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.headers['x-user-id'];
    if (!userId) return badRequest('Missing x-user-id header');

    const body = JSON.parse(event.body || '{}');
    const parsed = CreateRatingSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    const { placeId, placeName, stars, drinkName, description, photoKey, lat, lng, address } = parsed.data;
    const ratingId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Get username for denormalized data on place ratings
    const profileResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    const username = (profileResult.Item?.username as string) || 'unknown';

    // Transact: write user rating + place rating
    await dynamo.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: `USER#${userId}`,
                SK: `RATING#${timestamp}#${ratingId}`,
                ratingId,
                userId,
                placeId,
                placeName,
                stars,
                drinkName,
                description,
                photoKey,
                lat,
                lng,
                address,
                createdAt: timestamp,
                entityType: 'Rating',
              },
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: `PLACE#${placeId}`,
                SK: `RATING#${timestamp}#${ratingId}`,
                ratingId,
                userId,
                username,
                stars,
                drinkName,
                description,
                photoKey,
                address,
                createdAt: timestamp,
                entityType: 'PlaceRating',
              },
            },
          },
        ],
      })
    );

    // Upsert UserPlace (user's visited places list)
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `PLACE#${placeId}` },
        UpdateExpression:
          'SET placeName = :placeName, lat = :lat, lng = :lng, lastVisited = :ts, entityType = :et, placeId = :placeId, address = :addr ADD visitCount :one',
        ExpressionAttributeValues: {
          ':placeName': placeName,
          ':lat': lat,
          ':lng': lng,
          ':ts': timestamp,
          ':et': 'UserPlace',
          ':placeId': placeId,
          ':addr': address || '',
          ':one': 1,
        },
      })
    );

    // Recompute Place META using only the latest rating per user
    const allPlaceRatings = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PLACE#${placeId}`,
          ':sk': 'RATING#',
        },
        ScanIndexForward: false,
      })
    );

    // Group by userId, keep only the latest (first seen since sorted desc)
    const latestByUser = new Map<string, number>();
    for (const item of allPlaceRatings.Items || []) {
      const uid = item.userId as string;
      if (!latestByUser.has(uid)) {
        latestByUser.set(uid, item.stars as number);
      }
    }

    const uniqueRatings = Array.from(latestByUser.values());
    const ratingCount = uniqueRatings.length;
    const avgRating = ratingCount > 0
      ? Math.round((uniqueRatings.reduce((sum, s) => sum + s, 0) / ratingCount) * 10) / 10
      : 0;

    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `PLACE#${placeId}`, SK: 'META' },
        UpdateExpression:
          'SET avgRating = :avg, ratingCount = :cnt, #n = :name, lat = :lat, lng = :lng, address = :addr, placeId = :pid, entityType = :et',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: {
          ':avg': avgRating,
          ':cnt': ratingCount,
          ':name': placeName,
          ':lat': lat,
          ':lng': lng,
          ':addr': address || '',
          ':pid': placeId,
          ':et': 'Place',
        },
      })
    );

    return created({ ratingId, createdAt: timestamp });
  } catch (err) {
    return serverError(err);
  }
}
