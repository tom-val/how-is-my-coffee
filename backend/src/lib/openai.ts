const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5-mini';
const REQUEST_TIMEOUT_MS = 5_000;

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
              'You are a caffeine content database. Reply with only the number of milligrams as an integer.',
          },
          {
            role: 'user',
            content: `Caffeine in mg for a single serving of "${drinkName}"? Reply ONLY a number. If unknown reply 0.`,
          },
        ],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[OpenAI] Non-OK response: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    const mg = parseInt(text ?? '', 10);

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
