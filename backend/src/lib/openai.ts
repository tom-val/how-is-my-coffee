const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5-mini';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Ask GPT-5 mini for the caffeine content of a drink.
 * Returns null on any failure (missing key, network error, timeout, unparseable response).
 */
export async function resolveWithAi(drinkName: string): Promise<number | null> {
  if (!OPENAI_API_KEY) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a caffeine content expert. Given a drink name, reply with your best estimate of the caffeine content in milligrams for a standard single serving. Reply with ONLY an integer. For non-caffeinated drinks reply 0.',
          },
          {
            role: 'user',
            content: `How many mg of caffeine in "${drinkName}"?`,
          },
        ],
        max_completion_tokens: 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[OpenAI] Non-OK response: ${response.status} ${body}`);
      return null;
    }

    const data = await response.json();
    console.debug(`[OpenAI] Raw response: ${JSON.stringify(data)}`);

    // gpt-5-mini uses Responses API structure with output array
    const outputText =
      data.output?.[0]?.content?.[0]?.text ??
      data.choices?.[0]?.message?.content ??
      '';
    const text = String(outputText).trim();
    const mg = parseInt(text, 10);

    if (isNaN(mg) || mg < 0) {
      console.warn(`[OpenAI] Unparseable response: "${text}"`);
      return null;
    }

    return mg;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[OpenAI] Request failed: ${message}`);
    return null;
  }
}
