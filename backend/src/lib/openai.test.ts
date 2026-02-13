import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeOkResponse(content: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  };
}

describe('resolveWithAi', () => {
  let resolveWithAi: typeof import('./openai.js').resolveWithAi;

  beforeEach(async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    // Re-import to pick up the env var
    const mod = await import('./openai.js');
    resolveWithAi = mod.resolveWithAi;
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns parsed mg from a valid response', async () => {
    fetchMock.mockResolvedValueOnce(makeOkResponse('130'));

    const result = await resolveWithAi('Flat White');

    expect(result).toBe(130);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns 0 when AI says 0', async () => {
    fetchMock.mockResolvedValueOnce(makeOkResponse('0'));

    const result = await resolveWithAi('Orange Juice');

    expect(result).toBe(0);
  });

  it('sends correct request body', async () => {
    fetchMock.mockResolvedValueOnce(makeOkResponse('95'));

    await resolveWithAi('Americano');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-5-mini');
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(10);
    expect(body.messages[1].content).toContain('Americano');
  });

  it('returns null on non-OK HTTP response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });

    const result = await resolveWithAi('Espresso');

    expect(result).toBeNull();
  });

  it('returns null when response text is not a number', async () => {
    fetchMock.mockResolvedValueOnce(
      makeOkResponse('I think it has about 130mg of caffeine'),
    );

    const result = await resolveWithAi('Latte');

    expect(result).toBeNull();
  });

  it('returns null when response is negative', async () => {
    fetchMock.mockResolvedValueOnce(makeOkResponse('-5'));

    const result = await resolveWithAi('Water');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await resolveWithAi('Coffee');

    expect(result).toBeNull();
  });

  it('returns null on abort timeout', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    const result = await resolveWithAi('Coffee');

    expect(result).toBeNull();
  });
});
