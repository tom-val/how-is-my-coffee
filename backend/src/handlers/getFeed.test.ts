import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

vi.mock('../lib/s3.js', () => ({
  getPhotoUrl: vi.fn((key: string) => `/mocked/${key}`),
}));

const mockGetLikedRatingIds = vi.fn();
vi.mock('../lib/likes.js', () => ({
  getLikedRatingIds: (...args: unknown[]) => mockGetLikedRatingIds(...args),
}));

import { handler as rawHandler } from './getFeed.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(
  headers: Record<string, string> = {},
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    body: null,
    headers,
    queryStringParameters,
  } as unknown as APIGatewayProxyEventV2;
}

describe('getFeed handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLikedRatingIds.mockResolvedValue([]);
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
  });

  it('returns own ratings when user has no friends', async () => {
    // Friends query returns empty + profile query returns user
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({
      Item: { username: 'tomas', displayName: 'Tomas' },
    });

    // Own ratings
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#user-1',
          SK: 'RATING#2024-01-01',
          ratingId: 'r1',
          stars: 4,
          createdAt: '2024-01-01T00:00:00.000Z',
          entityType: 'Rating',
        },
      ],
    });

    const result = await handler(makeEvent({ 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ratings).toHaveLength(1);
    expect(body.ratings[0].ratingId).toBe('r1');
    expect(body.ratings[0].username).toBe('tomas');
  });

  it('returns merged and sorted ratings from self and friends', async () => {
    // Friends query
    mockSend.mockResolvedValueOnce({
      Items: [
        { friendUserId: 'friend-1', friendUsername: 'alice', friendDisplayName: 'Alice' },
        { friendUserId: 'friend-2', friendUsername: 'bob', friendDisplayName: 'Bob' },
      ],
    });

    // Profile query
    mockSend.mockResolvedValueOnce({
      Item: { username: 'tomas', displayName: 'Tomas' },
    });

    // Own ratings (fetched first since self is first in feedUsers)
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#user-1',
          SK: 'RATING#2024-01-04',
          ratingId: 'r4',
          stars: 5,
          createdAt: '2024-01-04T00:00:00.000Z',
          entityType: 'Rating',
        },
      ],
    });

    // Friend 1 ratings
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#friend-1',
          SK: 'RATING#2024-01-03',
          ratingId: 'r3',
          stars: 5,
          createdAt: '2024-01-03T00:00:00.000Z',
          entityType: 'Rating',
        },
        {
          PK: 'USER#friend-1',
          SK: 'RATING#2024-01-01',
          ratingId: 'r1',
          stars: 3,
          createdAt: '2024-01-01T00:00:00.000Z',
          entityType: 'Rating',
        },
      ],
    });

    // Friend 2 ratings
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#friend-2',
          SK: 'RATING#2024-01-02',
          ratingId: 'r2',
          stars: 4,
          photoKey: 'uploads/bob.jpg',
          createdAt: '2024-01-02T00:00:00.000Z',
          entityType: 'Rating',
        },
      ],
    });

    const result = await handler(makeEvent({ 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);

    // All 4 ratings, sorted newest first
    expect(body.ratings).toHaveLength(4);
    expect(body.ratings[0].ratingId).toBe('r4');
    expect(body.ratings[0].username).toBe('tomas');
    expect(body.ratings[1].ratingId).toBe('r3');
    expect(body.ratings[1].username).toBe('alice');
    expect(body.ratings[2].ratingId).toBe('r2');
    expect(body.ratings[2].username).toBe('bob');
    expect(body.ratings[2].photoUrl).toBe('/mocked/uploads/bob.jpg');
    expect(body.ratings[3].ratingId).toBe('r1');
    expect(body.ratings[3].username).toBe('alice');

    // DynamoDB internal fields stripped
    expect(body.ratings[0].PK).toBeUndefined();
    expect(body.ratings[0].SK).toBeUndefined();
    expect(body.ratings[0].entityType).toBeUndefined();
  });

  it('respects limit and provides nextCursor', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { friendUserId: 'friend-1', friendUsername: 'alice', friendDisplayName: 'Alice' },
      ],
    });

    // Profile
    mockSend.mockResolvedValueOnce({
      Item: { username: 'tomas', displayName: 'Tomas' },
    });

    // Own ratings (empty)
    mockSend.mockResolvedValueOnce({ Items: [] });

    // Return more items than the requested limit
    const items = Array.from({ length: 5 }, (_, i) => ({
      PK: 'USER#friend-1',
      SK: `RATING#2024-01-0${5 - i}`,
      ratingId: `r${5 - i}`,
      stars: 4,
      createdAt: `2024-01-0${5 - i}T00:00:00.000Z`,
      entityType: 'Rating',
    }));
    mockSend.mockResolvedValueOnce({ Items: items });

    const result = await handler(
      makeEvent({ 'x-user-id': 'user-1' }, { limit: '3' }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ratings).toHaveLength(3);
    expect(body.nextCursor).toBe('2024-01-03T00:00:00.000Z');
  });

  it('returns empty feed when profile is not found and no friends', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent({ 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ratings).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });
});
