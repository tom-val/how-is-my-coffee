import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

vi.stubGlobal('crypto', {
  randomUUID: () => 'comment-uuid-001',
});

import { handler as rawHandler } from './createComment.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(
  body: unknown,
  pathParameters: Record<string, string> = {},
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
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
  commentCount: 0,
  entityType: 'RatingMeta',
};

describe('createComment handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const result = await handler(
      makeEvent({ text: 'Great coffee!' }, { ratingId: 'r1' }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('Missing x-user-id header');
  });

  it('returns 400 when ratingId is missing', async () => {
    const result = await handler(
      makeEvent({ text: 'Great coffee!' }, {}, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('ratingId is required');
  });

  it('returns 400 when text is empty', async () => {
    const result = await handler(
      makeEvent({ text: '' }, { ratingId: 'r1' }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when rating META does not exist', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(
      makeEvent({ text: 'Nice!' }, { ratingId: 'r1' }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string).error).toBe('Rating not found');
  });

  it('creates a comment and increments counts on success', async () => {
    // Get META
    mockSend.mockResolvedValueOnce({ Item: META_ITEM });
    // Get current user profile
    mockSend.mockResolvedValueOnce({
      Item: { username: 'commenter', displayName: 'Commenter User' },
    });
    // PutCommand (COMMENT item)
    mockSend.mockResolvedValueOnce({});
    // 3x UpdateCommand (increment commentCount on META, user rating, place rating)
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({ text: 'Great coffee!' }, { ratingId: 'r1' }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body as string);
    expect(body.commentId).toBe('comment-uuid-001');
    expect(body.createdAt).toBeDefined();

    // Verify COMMENT item was written
    const putCall = mockSend.mock.calls[2][0];
    expect(putCall.input.Item.PK).toBe('RATING#r1');
    expect(putCall.input.Item.SK).toMatch(/^COMMENT#.*#comment-uuid-001$/);
    expect(putCall.input.Item.text).toBe('Great coffee!');
    expect(putCall.input.Item.username).toBe('commenter');
    expect(putCall.input.Item.entityType).toBe('Comment');
  });
});
