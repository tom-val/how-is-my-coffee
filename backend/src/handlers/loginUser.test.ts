import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

vi.mock('../lib/auth.js', () => ({
  verifyPassword: vi.fn(),
}));

import { handler as rawHandler } from './loginUser.js';
import { verifyPassword } from '../lib/auth.js';

const mockVerifyPassword = vi.mocked(verifyPassword);

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    headers: {},
    queryStringParameters: {},
  } as unknown as APIGatewayProxyEventV2;
}

describe('loginUser handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when body is empty', async () => {
    const result = await handler(makeEvent({}));

    expect(result.statusCode).toBe(400);
  });

  it('returns 401 when username is not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent({ username: 'nonexistent', password: 'pass123' }));

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body as string).error).toBe('Invalid username or password');
  });

  it('returns 401 when profile is not found', async () => {
    // Username lookup succeeds
    mockSend.mockResolvedValueOnce({ Item: { userId: 'user-1' } });
    // Profile lookup returns nothing
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent({ username: 'orphaned', password: 'pass123' }));

    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when password is incorrect', async () => {
    mockSend.mockResolvedValueOnce({ Item: { userId: 'user-1' } });
    mockSend.mockResolvedValueOnce({
      Item: {
        PK: 'USER#user-1',
        SK: 'PROFILE',
        userId: 'user-1',
        username: 'testuser',
        displayName: 'Test',
        passwordHash: 'salt:hash',
        entityType: 'User',
      },
    });
    mockVerifyPassword.mockReturnValueOnce(false);

    const result = await handler(makeEvent({ username: 'testuser', password: 'wrong' }));

    expect(result.statusCode).toBe(401);
  });

  it('returns 200 with user data (excluding sensitive fields) on success', async () => {
    mockSend.mockResolvedValueOnce({ Item: { userId: 'user-1' } });
    mockSend.mockResolvedValueOnce({
      Item: {
        PK: 'USER#user-1',
        SK: 'PROFILE',
        userId: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'salt:hash',
        entityType: 'User',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    });
    mockVerifyPassword.mockReturnValueOnce(true);

    const result = await handler(makeEvent({ username: 'TestUser', password: 'correct' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.userId).toBe('user-1');
    expect(body.username).toBe('testuser');
    expect(body.displayName).toBe('Test User');
    // Sensitive fields stripped
    expect(body.passwordHash).toBeUndefined();
    expect(body.PK).toBeUndefined();
    expect(body.SK).toBeUndefined();
    expect(body.entityType).toBeUndefined();
  });
});
