import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

vi.mock('../lib/s3.js', () => ({
  getPhotoUrl: (key: string) => `https://cdn.example.com/${key}`,
}));

import { handler as rawHandler } from './getRatingDetail.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(
  pathParameters: Record<string, string> = {},
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    body: '{}',
    headers,
    queryStringParameters: {},
    pathParameters,
  } as unknown as APIGatewayProxyEventV2;
}

describe('getRatingDetail handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when ratingId is missing', async () => {
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('ratingId is required');
  });

  it('returns 404 when rating META not found', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent({ ratingId: 'r1' }));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string).error).toBe('Rating not found');
  });

  it('returns rating with empty likes and comments', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'RATING#r1',
          SK: 'META',
          ratingId: 'r1',
          userId: 'owner-1',
          placeId: 'place-1',
          placeName: 'Good Cafe',
          stars: 4.5,
          drinkName: 'Flat White',
          likeCount: 0,
          commentCount: 0,
          createdAt: '2025-01-10T09:00:00.000Z',
          entityType: 'RatingMeta',
        },
      ],
    });

    const result = await handler(
      makeEvent({ ratingId: 'r1' }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.rating.ratingId).toBe('r1');
    expect(body.rating.placeName).toBe('Good Cafe');
    expect(body.likes).toEqual([]);
    expect(body.comments).toEqual([]);
    expect(body.isLikedByMe).toBe(false);
    // PK/SK/entityType should be stripped
    expect(body.rating.PK).toBeUndefined();
    expect(body.rating.SK).toBeUndefined();
    expect(body.rating.entityType).toBeUndefined();
  });

  it('returns likes and derives isLikedByMe correctly', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'RATING#r1',
          SK: 'LIKE#user-1',
          userId: 'user-1',
          username: 'tomas',
          displayName: 'Tomas',
        },
        {
          PK: 'RATING#r1',
          SK: 'LIKE#user-2',
          userId: 'user-2',
          username: 'friend',
          displayName: 'Friend',
        },
        {
          PK: 'RATING#r1',
          SK: 'META',
          ratingId: 'r1',
          userId: 'owner-1',
          placeId: 'place-1',
          stars: 4,
          likeCount: 2,
          commentCount: 0,
          createdAt: '2025-01-10T09:00:00.000Z',
          entityType: 'RatingMeta',
        },
      ],
    });

    const result = await handler(
      makeEvent({ ratingId: 'r1' }, { 'x-user-id': 'user-1' }),
    );

    const body = JSON.parse(result.body as string);
    expect(body.likes).toHaveLength(2);
    expect(body.isLikedByMe).toBe(true);
  });

  it('returns comments sorted chronologically', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'RATING#r1',
          SK: 'COMMENT#2025-01-11T10:00:00.000Z#c1',
          commentId: 'c1',
          userId: 'user-1',
          username: 'tomas',
          displayName: 'Tomas',
          text: 'First comment',
          createdAt: '2025-01-11T10:00:00.000Z',
          entityType: 'Comment',
        },
        {
          PK: 'RATING#r1',
          SK: 'COMMENT#2025-01-11T11:00:00.000Z#c2',
          commentId: 'c2',
          userId: 'user-2',
          username: 'friend',
          displayName: 'Friend',
          text: 'Second comment',
          createdAt: '2025-01-11T11:00:00.000Z',
          entityType: 'Comment',
        },
        {
          PK: 'RATING#r1',
          SK: 'META',
          ratingId: 'r1',
          userId: 'owner-1',
          placeId: 'place-1',
          stars: 4,
          likeCount: 0,
          commentCount: 2,
          createdAt: '2025-01-10T09:00:00.000Z',
          entityType: 'RatingMeta',
        },
      ],
    });

    const result = await handler(makeEvent({ ratingId: 'r1' }));

    const body = JSON.parse(result.body as string);
    expect(body.comments).toHaveLength(2);
    expect(body.comments[0].text).toBe('First comment');
    expect(body.comments[1].text).toBe('Second comment');
  });

  it('attaches photoUrl when photoKey is present', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'RATING#r1',
          SK: 'META',
          ratingId: 'r1',
          userId: 'owner-1',
          placeId: 'place-1',
          stars: 4,
          photoKey: 'photos/abc.jpg',
          likeCount: 0,
          commentCount: 0,
          createdAt: '2025-01-10T09:00:00.000Z',
          entityType: 'RatingMeta',
        },
      ],
    });

    const result = await handler(makeEvent({ ratingId: 'r1' }));

    const body = JSON.parse(result.body as string);
    expect(body.rating.photoUrl).toBe('https://cdn.example.com/photos/abc.jpg');
  });
});
