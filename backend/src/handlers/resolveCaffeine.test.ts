import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockResolveWithAi = vi.fn();

vi.mock('../lib/openai.js', () => ({
  resolveWithAi: (...args: unknown[]) => mockResolveWithAi(...args),
}));

import { handler as rawHandler } from './resolveCaffeine.js';

type Result = APIGatewayProxyStructuredResultV2;

async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  return (await rawHandler(event)) as Result;
}

function makeEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    headers: {},
    pathParameters: {},
    queryStringParameters: {},
  } as unknown as APIGatewayProxyEventV2;
}

describe('resolveCaffeine handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when drinkName is missing', async () => {
    const result = await handler(makeEvent({}));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when drinkName is empty', async () => {
    const result = await handler(makeEvent({ drinkName: '' }));

    expect(result.statusCode).toBe(400);
  });

  it('returns AI result when available', async () => {
    mockResolveWithAi.mockResolvedValueOnce(130);

    const result = await handler(makeEvent({ drinkName: 'Flat White' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.caffeineMg).toBe(130);
    expect(body.source).toBe('ai');
    expect(mockResolveWithAi).toHaveBeenCalledWith('Flat White');
  });

  it('returns 0 with error source when AI fails', async () => {
    mockResolveWithAi.mockResolvedValueOnce(null);

    const result = await handler(makeEvent({ drinkName: 'Mystery Drink' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.caffeineMg).toBe(0);
    expect(body.source).toBe('error');
  });
});
