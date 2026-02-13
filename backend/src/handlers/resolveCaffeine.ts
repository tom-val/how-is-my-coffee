import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { ok, badRequest, serverError } from '../lib/response.js';
import { resolveWithAi } from '../lib/openai.js';

const RequestSchema = z.object({
  drinkName: z.string().min(1).max(100),
});

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = JSON.parse(event.body || '{}');
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    const aiResult = await resolveWithAi(parsed.data.drinkName);

    if (aiResult !== null) {
      return ok({ caffeineMg: aiResult, source: 'ai' });
    }

    return ok({ caffeineMg: 0, source: 'error' });
  } catch (err) {
    return serverError(err);
  }
}
