import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

import { handler as rawHandler } from './updateRating.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(
  body: unknown,
  headers: Record<string, string> = {},
  pathParameters: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    headers,
    pathParameters,
    queryStringParameters: {},
  } as unknown as APIGatewayProxyEventV2;
}

const existingMeta = {
  PK: 'RATING#rating-001',
  SK: 'META',
  ratingId: 'rating-001',
  userId: 'user-1',
  placeId: 'place-1',
  placeName: 'Good Cafe',
  stars: 4,
  drinkName: 'Flat White',
  description: 'Excellent coffee',
  photoKey: 'photos/abc.jpg',
  lat: 51.5,
  lng: -0.1,
  address: '123 Coffee St',
  caffeineMg: 130,
  likeCount: 2,
  commentCount: 1,
  createdAt: '2024-06-15T10:00:00.000Z',
  entityType: 'RatingMeta',
};

describe('updateRating handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const result = await handler(
      makeEvent({ stars: 5 }, {}, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('Missing x-user-id header');
  });

  it('returns 400 when ratingId path parameter is missing', async () => {
    const result = await handler(
      makeEvent({ stars: 5 }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('ratingId is required');
  });

  it('returns 400 for invalid stars value', async () => {
    const result = await handler(
      makeEvent({ stars: 6 }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for non-half-step stars', async () => {
    const result = await handler(
      makeEvent({ stars: 3.3 }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for empty drinkName', async () => {
    const result = await handler(
      makeEvent({ drinkName: '' }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for negative caffeineMg', async () => {
    const result = await handler(
      makeEvent({ caffeineMg: -1 }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when rating does not exist', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(
      makeEvent({ stars: 5 }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string).error).toBe('Rating not found');
  });

  it('returns 403 when user does not own the rating', async () => {
    mockSend.mockResolvedValueOnce({ Item: existingMeta });

    const result = await handler(
      makeEvent({ stars: 5 }, { 'x-user-id': 'different-user' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body as string).error).toBe('You can only edit your own ratings');
  });

  it('updates stars and recomputes Place META average', async () => {
    // GetCommand (META fetch)
    mockSend.mockResolvedValueOnce({ Item: existingMeta });
    // 3x UpdateCommand (parallel updates to META, USER#, PLACE#)
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    // QueryCommand (all place ratings for recompute)
    mockSend.mockResolvedValueOnce({
      Items: [
        { userId: 'user-1', stars: 5 },
        { userId: 'user-2', stars: 3 },
      ],
    });
    // UpdateCommand (Place META recompute)
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({ stars: 5 }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ratingId).toBe('rating-001');
    expect(body.updatedAt).toBeDefined();

    // GET + 3 updates + query + META recompute = 6 calls
    expect(mockSend).toHaveBeenCalledTimes(6);

    // Verify Place META recompute: (5 + 3) / 2 = 4.0
    const metaRecomputeCall = mockSend.mock.calls[5][0];
    expect(metaRecomputeCall.input.ExpressionAttributeValues[':avg']).toBe(4);
    expect(metaRecomputeCall.input.ExpressionAttributeValues[':cnt']).toBe(2);
  });

  it('updates caffeineMg and adjusts user profile total', async () => {
    // GetCommand (META fetch)
    mockSend.mockResolvedValueOnce({ Item: existingMeta });
    // 3x UpdateCommand (parallel updates)
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    // UpdateCommand (caffeine delta adjustment)
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({ caffeineMg: 80 }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(200);

    // GET + 3 updates + caffeine delta = 5 calls
    expect(mockSend).toHaveBeenCalledTimes(5);

    // Verify caffeine delta: 80 - 130 = -50
    const caffeineDeltaCall = mockSend.mock.calls[4][0];
    expect(caffeineDeltaCall.input.UpdateExpression).toBe('ADD totalCaffeineMg :delta');
    expect(caffeineDeltaCall.input.ExpressionAttributeValues[':delta']).toBe(-50);
  });

  it('updates multiple fields at once', async () => {
    mockSend.mockResolvedValueOnce({ Item: existingMeta });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    // stars changed → query + recompute
    mockSend.mockResolvedValueOnce({
      Items: [{ userId: 'user-1', stars: 3 }],
    });
    mockSend.mockResolvedValueOnce({});
    // caffeineMg changed → delta
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent(
        { stars: 3, drinkName: 'Cappuccino', description: 'Good but not great', caffeineMg: 100 },
        { 'x-user-id': 'user-1' },
        { ratingId: 'rating-001' },
      ),
    );

    expect(result.statusCode).toBe(200);

    // Verify the META update contains all changed fields
    const metaUpdateCall = mockSend.mock.calls[1][0];
    const updateExpr = metaUpdateCall.input.UpdateExpression as string;
    expect(updateExpr).toContain('stars = :stars');
    expect(updateExpr).toContain('drinkName = :drinkName');
    expect(updateExpr).toContain('description = :description');
    expect(updateExpr).toContain('caffeineMg = :caffeineMg');
    expect(metaUpdateCall.input.ExpressionAttributeValues[':stars']).toBe(3);
    expect(metaUpdateCall.input.ExpressionAttributeValues[':drinkName']).toBe('Cappuccino');
  });

  it('clears description when null is sent', async () => {
    mockSend.mockResolvedValueOnce({ Item: existingMeta });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({ description: null }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(200);

    // GET + 3 updates = 4 calls (no stars/caffeine change)
    expect(mockSend).toHaveBeenCalledTimes(4);

    // Verify REMOVE expression is used for description
    const metaUpdateCall = mockSend.mock.calls[1][0];
    const updateExpr = metaUpdateCall.input.UpdateExpression as string;
    expect(updateExpr).toContain('REMOVE description');
  });

  it('succeeds with empty body (only updatedAt is set)', async () => {
    mockSend.mockResolvedValueOnce({ Item: existingMeta });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({}, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(200);

    // GET + 3 updates = 4 calls (no side effects)
    expect(mockSend).toHaveBeenCalledTimes(4);

    // Verify only updatedAt is in the expression
    const metaUpdateCall = mockSend.mock.calls[1][0];
    const updateExpr = metaUpdateCall.input.UpdateExpression as string;
    expect(updateExpr).toBe('SET updatedAt = :updatedAt');
  });

  it('does not recompute Place META when stars are unchanged', async () => {
    mockSend.mockResolvedValueOnce({ Item: existingMeta });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    // Send the same stars value as existing
    const result = await handler(
      makeEvent({ stars: 4 }, { 'x-user-id': 'user-1' }, { ratingId: 'rating-001' }),
    );

    expect(result.statusCode).toBe(200);
    // GET + 3 updates = 4 calls (no recompute since stars didn't change)
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('updates placeName and location fields', async () => {
    mockSend.mockResolvedValueOnce({ Item: existingMeta });
    // 3x UpdateCommand (parallel updates to rating copies)
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    // 2x UpdateCommand (Place META + UserPlace)
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent(
        { placeName: 'Great Cafe', lat: 52.0, lng: -0.2, address: '456 New St' },
        { 'x-user-id': 'user-1' },
        { ratingId: 'rating-001' },
      ),
    );

    expect(result.statusCode).toBe(200);

    // GET + 3 rating updates + 2 place updates = 6 calls
    expect(mockSend).toHaveBeenCalledTimes(6);

    // Verify Place META update includes name, lat, lng, address
    const placeMetaCall = mockSend.mock.calls[4][0];
    const placeMetaExpr = placeMetaCall.input.UpdateExpression as string;
    expect(placeMetaExpr).toContain('#n = :name');
    expect(placeMetaCall.input.ExpressionAttributeValues[':name']).toBe('Great Cafe');
    expect(placeMetaCall.input.ExpressionAttributeValues[':lat']).toBe(52.0);

    // Verify UserPlace update
    const userPlaceCall = mockSend.mock.calls[5][0];
    const userPlaceExpr = userPlaceCall.input.UpdateExpression as string;
    expect(userPlaceExpr).toContain('placeName = :placeName');
    expect(userPlaceCall.input.ExpressionAttributeValues[':placeName']).toBe('Great Cafe');
  });
});
