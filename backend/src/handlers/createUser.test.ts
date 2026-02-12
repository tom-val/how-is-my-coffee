import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

vi.mock('../lib/auth.js', () => ({
  hashPassword: vi.fn().mockReturnValue('salt123:hash456'),
}));

// Stable UUID for assertions
vi.stubGlobal('crypto', {
  randomUUID: () => '00000000-0000-0000-0000-000000000001',
});

import { handler as rawHandler } from './createUser.js';

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

describe('createUser handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when username is too short', async () => {
    const result = await handler(makeEvent({ username: 'ab', displayName: 'Test', password: '123456' }));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const result = await handler(makeEvent({ username: 'validuser', displayName: 'Test', password: '12345' }));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when username contains invalid characters', async () => {
    const result = await handler(makeEvent({ username: 'user@name!', displayName: 'Test', password: '123456' }));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when body is missing required fields', async () => {
    const result = await handler(makeEvent({}));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when username is already taken', async () => {
    // GetCommand returns an existing item
    mockSend.mockResolvedValueOnce({ Item: { PK: 'USERNAME#taken', SK: 'USERNAME', userId: 'existing' } });

    const result = await handler(makeEvent({ username: 'taken', displayName: 'Test', password: '123456' }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('Username already taken');
  });

  it('creates a user and returns 201 on success', async () => {
    // GetCommand returns no item (username available)
    mockSend.mockResolvedValueOnce({ Item: undefined });
    // Two PutCommands succeed
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({ username: 'NewUser', displayName: 'New User', password: 'secret123' }),
    );

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body as string);
    expect(body.userId).toBe('00000000-0000-0000-0000-000000000001');
    expect(body.username).toBe('newuser'); // lowercased
    expect(body.displayName).toBe('New User');
    expect(body.createdAt).toBeDefined();

    // Verify DynamoDB calls: 1 Get + 2 Puts
    expect(mockSend).toHaveBeenCalledTimes(3);
  });
});
