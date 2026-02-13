import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

// Stable UUID for assertions
vi.stubGlobal('crypto', {
  randomUUID: () => 'rating-uuid-001',
});

import { handler as rawHandler } from './createRating.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    headers,
    queryStringParameters: {},
  } as unknown as APIGatewayProxyEventV2;
}

const validBody = {
  placeId: 'place-1',
  placeName: 'Good Cafe',
  stars: 4.5,
  drinkName: 'Flat White',
  description: 'Excellent coffee',
  lat: 51.5,
  lng: -0.1,
  address: '123 Coffee St',
  caffeineMg: 130,
};

describe('createRating handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const result = await handler(makeEvent(validBody));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('Missing x-user-id header');
  });

  it('returns 400 for invalid body (missing required fields)', async () => {
    const result = await handler(makeEvent({}, { 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid stars value', async () => {
    const result = await handler(
      makeEvent({ ...validBody, stars: 6 }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for non-half-step stars', async () => {
    const result = await handler(
      makeEvent({ ...validBody, stars: 3.3 }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(400);
  });

  it('creates a rating and returns 201 on success', async () => {
    // Profile lookup
    mockSend.mockResolvedValueOnce({
      Item: { username: 'testuser' },
    });
    // TransactWriteCommand
    mockSend.mockResolvedValueOnce({});
    // UpdateCommand (UserPlace upsert)
    mockSend.mockResolvedValueOnce({});
    // QueryCommand (all place ratings for recompute)
    mockSend.mockResolvedValueOnce({
      Items: [
        { userId: 'user-1', stars: 4.5 },
        { userId: 'user-2', stars: 3 },
      ],
    });
    // UpdateCommand (Place META update)
    mockSend.mockResolvedValueOnce({});
    // UpdateCommand (caffeine ADD on profile)
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent(validBody, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body as string);
    expect(body.ratingId).toBe('rating-uuid-001');
    expect(body.createdAt).toBeDefined();

    // Profile + Transact + Upsert + Query + META update + caffeine ADD
    expect(mockSend).toHaveBeenCalledTimes(6);

    // Verify caffeineMg from request body is stored on the user rating item
    const transactCall = mockSend.mock.calls[1][0];
    const userRatingItem = transactCall.input.TransactItems[0].Put.Item;
    expect(userRatingItem.caffeineMg).toBe(130);
    expect(userRatingItem.likeCount).toBe(0);
    expect(userRatingItem.commentCount).toBe(0);

    // Verify place rating item also has likeCount/commentCount
    const placeRatingItem = transactCall.input.TransactItems[1].Put.Item;
    expect(placeRatingItem.likeCount).toBe(0);
    expect(placeRatingItem.commentCount).toBe(0);

    // Verify RATING#/META item is written for likes/comments partition
    const ratingMetaItem = transactCall.input.TransactItems[2].Put.Item;
    expect(ratingMetaItem.PK).toBe('RATING#rating-uuid-001');
    expect(ratingMetaItem.SK).toBe('META');
    expect(ratingMetaItem.entityType).toBe('RatingMeta');
    expect(ratingMetaItem.likeCount).toBe(0);
    expect(ratingMetaItem.commentCount).toBe(0);
    expect(ratingMetaItem.userId).toBe('user-1');

    // Verify caffeine ADD on profile uses the client-sent value
    const caffeineAddCall = mockSend.mock.calls[5][0];
    expect(caffeineAddCall.input.UpdateExpression).toBe('ADD totalCaffeineMg :mg');
    expect(caffeineAddCall.input.ExpressionAttributeValues[':mg']).toBe(130);
  });

  it('computes average rating using only latest rating per user', async () => {
    mockSend.mockResolvedValueOnce({ Item: { username: 'testuser' } });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    // Multiple ratings from same user (sorted desc by SK) — only first per user counts
    mockSend.mockResolvedValueOnce({
      Items: [
        { userId: 'user-1', stars: 5 },   // latest from user-1
        { userId: 'user-1', stars: 2 },   // older from user-1 — ignored
        { userId: 'user-2', stars: 3 },   // latest from user-2
      ],
    });
    mockSend.mockResolvedValueOnce({});
    // Caffeine ADD
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent(validBody, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(201);

    // Verify the META update call contains correct average: (5 + 3) / 2 = 4.0
    const metaUpdateCall = mockSend.mock.calls[4][0];
    expect(metaUpdateCall.input.ExpressionAttributeValues[':avg']).toBe(4);
    expect(metaUpdateCall.input.ExpressionAttributeValues[':cnt']).toBe(2);
  });

  it('defaults caffeineMg to 0 when not provided in request body', async () => {
    mockSend.mockResolvedValueOnce({ Item: { username: 'testuser' } });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({ Items: [{ userId: 'user-1', stars: 4 }] });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const { caffeineMg: _, ...bodyWithoutCaffeine } = validBody;

    const result = await handler(
      makeEvent(bodyWithoutCaffeine, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(201);

    // Verify caffeineMg defaults to 0 on the rating item
    const transactCall = mockSend.mock.calls[1][0];
    const userRatingItem = transactCall.input.TransactItems[0].Put.Item;
    expect(userRatingItem.caffeineMg).toBe(0);

    // Caffeine ADD still called with 0
    const caffeineAddCall = mockSend.mock.calls[5][0];
    expect(caffeineAddCall.input.ExpressionAttributeValues[':mg']).toBe(0);
  });
});
