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

import { handler as rawHandler } from './getUserRatings.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(
  pathParameters?: Record<string, string>,
  queryStringParameters?: Record<string, string>,
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    body: null,
    headers,
    pathParameters,
    queryStringParameters,
  } as unknown as APIGatewayProxyEventV2;
}

describe('getUserRatings handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLikedRatingIds.mockResolvedValue([]);
  });

  it('returns 400 when userId path parameter is missing', async () => {
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('userId is required');
  });

  it('returns ratings with photo URLs attached', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#user-1',
          SK: 'RATING#2024-01-02#r2',
          ratingId: 'r2',
          stars: 4.5,
          photoKey: 'uploads/photo2.jpg',
          entityType: 'Rating',
          createdAt: '2024-01-02T00:00:00.000Z',
        },
        {
          PK: 'USER#user-1',
          SK: 'RATING#2024-01-01#r1',
          ratingId: 'r1',
          stars: 3,
          entityType: 'Rating',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      LastEvaluatedKey: undefined,
    });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ratings).toHaveLength(2);

    // First rating has photoUrl set
    expect(body.ratings[0].photoUrl).toBe('/mocked/uploads/photo2.jpg');
    expect(body.ratings[0].photoKey).toBe('uploads/photo2.jpg');

    // Second rating has no photo
    expect(body.ratings[1].photoUrl).toBeUndefined();

    // Internal DynamoDB fields stripped
    expect(body.ratings[0].PK).toBeUndefined();
    expect(body.ratings[0].SK).toBeUndefined();
    expect(body.ratings[0].entityType).toBeUndefined();

    // No next cursor when no LastEvaluatedKey
    expect(body.nextCursor).toBeNull();
  });

  it('returns an empty array when user has no ratings', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ratings).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('returns a nextCursor when LastEvaluatedKey is present', async () => {
    const lastKey = { PK: 'USER#user-1', SK: 'RATING#2024-01-01#r1' };
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: lastKey });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.nextCursor).toBeTypeOf('string');

    // Verify cursor decodes back to the key
    const decoded = JSON.parse(Buffer.from(body.nextCursor, 'base64url').toString('utf-8'));
    expect(decoded).toEqual(lastKey);
  });

  it('returns likedRatingIds for the current user', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#user-1',
          SK: 'RATING#2024-01-01#r1',
          ratingId: 'r1',
          stars: 4,
          entityType: 'Rating',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'USER#user-1',
          SK: 'RATING#2024-01-02#r2',
          ratingId: 'r2',
          stars: 5,
          entityType: 'Rating',
          createdAt: '2024-01-02T00:00:00.000Z',
        },
      ],
      LastEvaluatedKey: undefined,
    });
    mockGetLikedRatingIds.mockResolvedValueOnce(['r1']);

    const result = await handler(
      makeEvent({ userId: 'user-1' }, undefined, { 'x-user-id': 'viewer-1' }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.likedRatingIds).toEqual(['r1']);
    expect(mockGetLikedRatingIds).toHaveBeenCalledWith(['r1', 'r2'], 'viewer-1');
  });
});
