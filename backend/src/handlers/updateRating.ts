import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, notFound, forbidden, serverError } from '../lib/response.js';

const UpdateRatingSchema = z.object({
  stars: z.number().min(1).max(5).multipleOf(0.5).optional(),
  drinkName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  photoKey: z.string().optional().nullable(),
  caffeineMg: z.number().min(0).max(1000).optional(),
  placeName: z.string().min(1).max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().max(300).optional().nullable(),
});

interface ExpressionParts {
  setParts: string[];
  removeParts: string[];
  names: Record<string, string>;
  values: Record<string, unknown>;
}

/**
 * Builds a dynamic DynamoDB UpdateExpression from the provided fields.
 * Returns null if no fields would be updated (impossible in practice since updatedAt is always set).
 */
function buildUpdateExpression(
  data: z.infer<typeof UpdateRatingSchema>,
  updatedAt: string,
  fieldsForCopy: Set<string>,
): ExpressionParts {
  const setParts: string[] = [];
  const removeParts: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  // Always set updatedAt
  setParts.push('updatedAt = :updatedAt');
  values[':updatedAt'] = updatedAt;

  const fieldMappings: Array<{ key: keyof z.infer<typeof UpdateRatingSchema>; attr: string; nullable: boolean }> = [
    { key: 'stars', attr: 'stars', nullable: false },
    { key: 'drinkName', attr: 'drinkName', nullable: false },
    { key: 'description', attr: 'description', nullable: true },
    { key: 'photoKey', attr: 'photoKey', nullable: true },
    { key: 'caffeineMg', attr: 'caffeineMg', nullable: false },
    { key: 'placeName', attr: 'placeName', nullable: false },
    { key: 'lat', attr: 'lat', nullable: false },
    { key: 'lng', attr: 'lng', nullable: false },
    { key: 'address', attr: 'address', nullable: true },
  ];

  for (const { key, attr, nullable } of fieldMappings) {
    if (!fieldsForCopy.has(key)) continue;
    if (data[key] === undefined) continue;

    if (nullable && data[key] === null) {
      removeParts.push(attr);
    } else {
      setParts.push(`${attr} = :${attr}`);
      values[`:${attr}`] = data[key];
    }
  }

  return { setParts, removeParts, names, values };
}

function toUpdateExpression(parts: ExpressionParts): string {
  const clauses: string[] = [];
  if (parts.setParts.length > 0) clauses.push(`SET ${parts.setParts.join(', ')}`);
  if (parts.removeParts.length > 0) clauses.push(`REMOVE ${parts.removeParts.join(', ')}`);
  return clauses.join(' ');
}

// Fields stored on each denormalised copy
const META_FIELDS = new Set(['stars', 'drinkName', 'description', 'photoKey', 'caffeineMg', 'placeName', 'lat', 'lng', 'address']);
const USER_RATING_FIELDS = new Set(['stars', 'drinkName', 'description', 'photoKey', 'caffeineMg', 'placeName', 'lat', 'lng', 'address']);
const PLACE_RATING_FIELDS = new Set(['stars', 'drinkName', 'description', 'photoKey', 'caffeineMg', 'address']);

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.headers['x-user-id'];
    if (!userId) return badRequest('Missing x-user-id header');

    const ratingId = event.pathParameters?.ratingId;
    if (!ratingId) return badRequest('ratingId is required');

    const body = JSON.parse(event.body || '{}');
    const parsed = UpdateRatingSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    // Fetch existing rating META to get createdAt, placeId, and old values
    const metaResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `RATING#${ratingId}`, SK: 'META' },
      })
    );
    if (!metaResult.Item) return notFound('Rating not found');

    const meta = metaResult.Item;
    if (meta.userId !== userId) return forbidden('You can only edit your own ratings');

    const createdAt = meta.createdAt as string;
    const placeId = meta.placeId as string;
    const ratingSK = `RATING#${createdAt}#${ratingId}`;
    const updatedAt = new Date().toISOString();

    const oldStars = meta.stars as number;
    const oldCaffeineMg = (meta.caffeineMg as number) || 0;

    // Build update expressions for each denormalised copy
    const metaExpr = buildUpdateExpression(parsed.data, updatedAt, META_FIELDS);
    const userExpr = buildUpdateExpression(parsed.data, updatedAt, USER_RATING_FIELDS);
    const placeExpr = buildUpdateExpression(parsed.data, updatedAt, PLACE_RATING_FIELDS);

    // Update all 3 copies in parallel
    await Promise.all([
      dynamo.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `RATING#${ratingId}`, SK: 'META' },
          UpdateExpression: toUpdateExpression(metaExpr),
          ...(Object.keys(metaExpr.names).length > 0 && { ExpressionAttributeNames: metaExpr.names }),
          ExpressionAttributeValues: metaExpr.values,
        })
      ),
      dynamo.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: ratingSK },
          UpdateExpression: toUpdateExpression(userExpr),
          ...(Object.keys(userExpr.names).length > 0 && { ExpressionAttributeNames: userExpr.names }),
          ExpressionAttributeValues: userExpr.values,
        })
      ),
      dynamo.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `PLACE#${placeId}`, SK: ratingSK },
          UpdateExpression: toUpdateExpression(placeExpr),
          ...(Object.keys(placeExpr.names).length > 0 && { ExpressionAttributeNames: placeExpr.names }),
          ExpressionAttributeValues: placeExpr.values,
        })
      ),
    ]);

    // If stars changed, recompute Place META average (only latest rating per user counts)
    if (parsed.data.stars !== undefined && parsed.data.stars !== oldStars) {
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
          UpdateExpression: 'SET avgRating = :avg, ratingCount = :cnt',
          ExpressionAttributeValues: {
            ':avg': avgRating,
            ':cnt': ratingCount,
          },
        })
      );
    }

    // If caffeineMg changed, adjust user profile total
    if (parsed.data.caffeineMg !== undefined && parsed.data.caffeineMg !== oldCaffeineMg) {
      const delta = parsed.data.caffeineMg - oldCaffeineMg;
      await dynamo.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
          UpdateExpression: 'ADD totalCaffeineMg :delta',
          ExpressionAttributeValues: { ':delta': delta },
        })
      );
    }

    // If place name or location changed, update Place META and UserPlace
    const isPlaceNameChanged = parsed.data.placeName !== undefined;
    const isLatChanged = parsed.data.lat !== undefined;
    const isLngChanged = parsed.data.lng !== undefined;
    const isAddressChanged = parsed.data.address !== undefined;
    const isPlaceInfoChanged = isPlaceNameChanged || isLatChanged || isLngChanged || isAddressChanged;

    if (isPlaceInfoChanged) {
      const placeMetaSetParts: string[] = [];
      const placeMetaValues: Record<string, unknown> = {};
      const placeMetaNames: Record<string, string> = {};

      if (isPlaceNameChanged) {
        placeMetaSetParts.push('#n = :name');
        placeMetaNames['#n'] = 'name';
        placeMetaValues[':name'] = parsed.data.placeName;
      }
      if (isLatChanged) {
        placeMetaSetParts.push('lat = :lat');
        placeMetaValues[':lat'] = parsed.data.lat;
      }
      if (isLngChanged) {
        placeMetaSetParts.push('lng = :lng');
        placeMetaValues[':lng'] = parsed.data.lng;
      }
      if (isAddressChanged) {
        if (parsed.data.address === null) {
          placeMetaSetParts.push('address = :addr');
          placeMetaValues[':addr'] = '';
        } else {
          placeMetaSetParts.push('address = :addr');
          placeMetaValues[':addr'] = parsed.data.address;
        }
      }

      const userPlaceSetParts: string[] = [];
      const userPlaceValues: Record<string, unknown> = {};

      if (isPlaceNameChanged) {
        userPlaceSetParts.push('placeName = :placeName');
        userPlaceValues[':placeName'] = parsed.data.placeName;
      }
      if (isLatChanged) {
        userPlaceSetParts.push('lat = :lat');
        userPlaceValues[':lat'] = parsed.data.lat;
      }
      if (isLngChanged) {
        userPlaceSetParts.push('lng = :lng');
        userPlaceValues[':lng'] = parsed.data.lng;
      }
      if (isAddressChanged) {
        userPlaceSetParts.push('address = :addr');
        userPlaceValues[':addr'] = parsed.data.address === null ? '' : parsed.data.address;
      }

      await Promise.all([
        placeMetaSetParts.length > 0
          ? dynamo.send(
              new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `PLACE#${placeId}`, SK: 'META' },
                UpdateExpression: `SET ${placeMetaSetParts.join(', ')}`,
                ...(Object.keys(placeMetaNames).length > 0 && { ExpressionAttributeNames: placeMetaNames }),
                ExpressionAttributeValues: placeMetaValues,
              })
            )
          : Promise.resolve(),
        userPlaceSetParts.length > 0
          ? dynamo.send(
              new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: `PLACE#${placeId}` },
                UpdateExpression: `SET ${userPlaceSetParts.join(', ')}`,
                ExpressionAttributeValues: userPlaceValues,
              })
            )
          : Promise.resolve(),
      ]);
    }

    return ok({ ratingId, updatedAt });
  } catch (err) {
    return serverError(err);
  }
}
