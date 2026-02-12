import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('../lib/dynamo.js', () => ({
  dynamo: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: 'CoffeeApp',
}));

import { handler as rawHandler } from './getCaffeineStats.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return await rawHandler(event) as Result;
}

function makeEvent(
  pathParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    body: null,
    headers: {},
    pathParameters,
    queryStringParameters: {},
  } as unknown as APIGatewayProxyEventV2;
}

describe('getCaffeineStats handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when userId path parameter is missing', async () => {
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('userId is required');
  });

  it('returns zeroes when no ratings today and no profile total', async () => {
    // Today's ratings query — empty
    mockSend.mockResolvedValueOnce({ Items: [] });
    // Profile get — no totalCaffeineMg
    mockSend.mockResolvedValueOnce({ Item: {} });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.todayMg).toBe(0);
    expect(body.totalMg).toBe(0);
  });

  it('sums caffeineMg from multiple ratings today', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { caffeineMg: 130 },
        { caffeineMg: 63 },
        { caffeineMg: 0 },
      ],
    });
    mockSend.mockResolvedValueOnce({ Item: { totalCaffeineMg: 500 } });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.todayMg).toBe(193);
    expect(body.totalMg).toBe(500);
  });

  it('handles ratings without caffeineMg field gracefully', async () => {
    // Older ratings created before caffeine tracking may lack the field
    mockSend.mockResolvedValueOnce({
      Items: [
        { caffeineMg: 130 },
        { stars: 4.5 }, // no caffeineMg
      ],
    });
    mockSend.mockResolvedValueOnce({ Item: {} });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.todayMg).toBe(130);
  });

  it('returns totalMg from profile', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Item: { totalCaffeineMg: 2450 } });

    const result = await handler(makeEvent({ userId: 'user-1' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.totalMg).toBe(2450);
  });
});
