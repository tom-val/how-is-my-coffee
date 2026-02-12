import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { getPresignedUploadUrl } from '../lib/s3.js';
import { ok, badRequest, serverError } from '../lib/response.js';

const Schema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().regex(/^image\//),
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.headers['x-user-id'];
    if (!userId) return badRequest('Missing x-user-id header');

    const body = JSON.parse(event.body || '{}');
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    const ext = parsed.data.fileName.split('.').pop() || 'jpg';
    const key = `uploads/${userId}/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(key, parsed.data.contentType);

    return ok({ uploadUrl, key });
  } catch (err) {
    return serverError(err);
  }
}
