import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export function parsePaginationParams(event: APIGatewayProxyEventV2) {
  const qs = event.queryStringParameters || {};

  let limit = parseInt(qs.limit || '', 10);
  if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (qs.cursor) {
    try {
      const json = Buffer.from(qs.cursor, 'base64url').toString('utf-8');
      exclusiveStartKey = JSON.parse(json);
    } catch {
      // Invalid cursor — start from beginning
      exclusiveStartKey = undefined;
    }
  }

  return { limit, exclusiveStartKey };
}

export function encodeCursor(
  lastEvaluatedKey: Record<string, unknown> | undefined
): string | null {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64url');
}
