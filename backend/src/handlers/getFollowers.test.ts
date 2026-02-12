import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

import { handler as rawHandler } from './getFollowers.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(
  pathParameters: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    pathParameters,
    headers: {},
    queryStringParameters: {},
  } as unknown as APIGatewayProxyEventV2;
}

describe('getFollowers handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when userId is missing', async () => {
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('userId is required');
  });

  it('returns empty array when user has no followers', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.followers).toEqual([]);
  });

  it('returns followers with PK, SK, and entityType stripped', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#user-1',
          SK: 'FOLLOWER#user-2',
          followerUserId: 'user-2',
          followerUsername: 'alice',
          followerDisplayName: 'Alice',
          followedAt: '2025-01-01T00:00:00.000Z',
          entityType: 'Follower',
        },
        {
          PK: 'USER#user-1',
          SK: 'FOLLOWER#user-3',
          followerUserId: 'user-3',
          followerUsername: 'bob',
          followerDisplayName: 'Bob',
          followedAt: '2025-01-02T00:00:00.000Z',
          entityType: 'Follower',
        },
      ],
    });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.followers).toHaveLength(2);
    expect(body.followers[0]).toEqual({
      followerUserId: 'user-2',
      followerUsername: 'alice',
      followerDisplayName: 'Alice',
      followedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(body.followers[1]).toEqual({
      followerUserId: 'user-3',
      followerUsername: 'bob',
      followerDisplayName: 'Bob',
      followedAt: '2025-01-02T00:00:00.000Z',
    });
  });
});
