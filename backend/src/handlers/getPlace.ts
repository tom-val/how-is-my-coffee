import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, notFound, serverError } from '../lib/response.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const placeId = event.pathParameters?.placeId;
    if (!placeId) return badRequest('placeId is required');

    const result = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `PLACE#${placeId}`, SK: 'META' },
      })
    );

    if (!result.Item) return notFound('Place not found');

    const { PK, SK, entityType, ...place } = result.Item;
    return ok(place);
  } catch (err) {
    return serverError(err);
  }
}
