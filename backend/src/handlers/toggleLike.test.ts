import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

import { handler as rawHandler } from './toggleLike.js';

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

const META_ITEM = {
  PK: 'RATING#r1',
  SK: 'META',
  ratingId: 'r1',
  userId: 'owner-1',
  placeId: 'place-1',
  createdAt: '2025-01-10T09:00:00.000Z',
  likeCount: 2,
  entityType: 'RatingMeta',
};

describe('toggleLike handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const result = await handler(makeEvent({ ratingId: 'r1' }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('Missing x-user-id header');
  });

  it('returns 400 when ratingId is missing', async () => {
    const result = await handler(makeEvent({}, { 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('ratingId is required');
  });

  it('returns 404 when rating META does not exist', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent({ ratingId: 'r1' }, { 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string).error).toBe('Rating not found');
  });

  it('creates a like when not already liked', async () => {
    // Get META
    mockSend.mockResolvedValueOnce({ Item: META_ITEM });
    // Check existing like — not found
    mockSend.mockResolvedValueOnce({ Item: undefined });
    // Get current user profile
    mockSend.mockResolvedValueOnce({
      Item: { username: 'liker', displayName: 'Liker User' },
    });
    // PutCommand (LIKE item)
    mockSend.mockResolvedValueOnce({});
    // 3x UpdateCommand (increment likeCount on META, user rating, place rating)
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent({ ratingId: 'r1' }, { 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.liked).toBe(true);
    expect(body.likeCount).toBe(3); // was 2, now 3

    // Verify LIKE item was written
    const putCall = mockSend.mock.calls[3][0];
    expect(putCall.input.Item.PK).toBe('RATING#r1');
    expect(putCall.input.Item.SK).toBe('LIKE#user-1');
    expect(putCall.input.Item.username).toBe('liker');
    expect(putCall.input.Item.entityType).toBe('Like');
  });

  it('removes a like when already liked', async () => {
    // Get META
    mockSend.mockResolvedValueOnce({ Item: META_ITEM });
    // Check existing like — found
    mockSend.mockResolvedValueOnce({
      Item: { PK: 'RATING#r1', SK: 'LIKE#user-1', userId: 'user-1' },
    });
    // DeleteCommand (remove LIKE item)
    mockSend.mockResolvedValueOnce({});
    // 3x UpdateCommand (decrement likeCount)
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent({ ratingId: 'r1' }, { 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.liked).toBe(false);
    expect(body.likeCount).toBe(1); // was 2, now 1

    // Verify LIKE item was deleted
    const deleteCall = mockSend.mock.calls[2][0];
    expect(deleteCall.input.Key.PK).toBe('RATING#r1');
    expect(deleteCall.input.Key.SK).toBe('LIKE#user-1');
  });
});
