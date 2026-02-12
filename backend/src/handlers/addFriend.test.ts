import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

import { handler as rawHandler } from './addFriend.js';

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

describe('addFriend handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const result = await handler(makeEvent({ friendUsername: 'someone' }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('Missing x-user-id header');
  });

  it('returns 400 when friendUsername is missing from body', async () => {
    const result = await handler(makeEvent({}, { 'x-user-id': 'user-1' }));

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when friend username is not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(
      makeEvent({ friendUsername: 'nonexistent' }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string).error).toBe('User not found');
  });

  it('returns 400 when trying to add yourself as a friend', async () => {
    mockSend.mockResolvedValueOnce({ Item: { userId: 'user-1' } });

    const result = await handler(
      makeEvent({ friendUsername: 'myself' }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('Cannot add yourself as a friend');
  });

  it('creates a friend record and reverse follower record on success', async () => {
    // Username lookup
    mockSend.mockResolvedValueOnce({ Item: { userId: 'friend-1' } });
    // Friend profile lookup
    mockSend.mockResolvedValueOnce({ Item: { displayName: 'Friend One' } });
    // Current user profile lookup
    mockSend.mockResolvedValueOnce({ Item: { username: 'currentuser', displayName: 'Current User' } });
    // PutCommand — FRIEND# record
    mockSend.mockResolvedValueOnce({});
    // PutCommand — FOLLOWER# record
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({ friendUsername: 'FriendUser' }, { 'x-user-id': 'user-1' }),
    );

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body as string);
    expect(body.friendUserId).toBe('friend-1');
    expect(body.friendUsername).toBe('frienduser'); // lowercased
    expect(body.friendDisplayName).toBe('Friend One');

    // 1 Get (username) + 1 Get (friend profile) + 1 Get (current user profile) + 2 Puts
    expect(mockSend).toHaveBeenCalledTimes(5);

    // Verify FRIEND# record
    const friendPutInput = mockSend.mock.calls[3][0].input;
    expect(friendPutInput.Item.PK).toBe('USER#user-1');
    expect(friendPutInput.Item.SK).toBe('FRIEND#friend-1');
    expect(friendPutInput.Item.entityType).toBe('Friend');

    // Verify reverse FOLLOWER# record
    const followerPutInput = mockSend.mock.calls[4][0].input;
    expect(followerPutInput.Item.PK).toBe('USER#friend-1');
    expect(followerPutInput.Item.SK).toBe('FOLLOWER#user-1');
    expect(followerPutInput.Item.followerUserId).toBe('user-1');
    expect(followerPutInput.Item.followerUsername).toBe('currentuser');
    expect(followerPutInput.Item.followerDisplayName).toBe('Current User');
    expect(followerPutInput.Item.entityType).toBe('Follower');
  });
});
