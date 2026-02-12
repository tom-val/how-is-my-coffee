import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { parsePaginationParams, encodeCursor } from './pagination.js';

function makeEvent(
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return { queryStringParameters } as unknown as APIGatewayProxyEventV2;
}

describe('pagination', () => {
  describe('parsePaginationParams', () => {
    it('returns default limit of 10 when no params provided', () => {
      const result = parsePaginationParams(makeEvent());

      expect(result.limit).toBe(10);
      expect(result.exclusiveStartKey).toBeUndefined();
    });

    it('parses a valid limit', () => {
      const result = parsePaginationParams(makeEvent({ limit: '25' }));

      expect(result.limit).toBe(25);
    });

    it('clamps limit above MAX_LIMIT (50) to 50', () => {
      const result = parsePaginationParams(makeEvent({ limit: '100' }));

      expect(result.limit).toBe(50);
    });

    it('falls back to default for invalid limit values', () => {
      expect(parsePaginationParams(makeEvent({ limit: '-1' })).limit).toBe(10);
      expect(parsePaginationParams(makeEvent({ limit: '0' })).limit).toBe(10);
      expect(parsePaginationParams(makeEvent({ limit: 'abc' })).limit).toBe(10);
    });

    it('decodes a valid base64url cursor', () => {
      const key = { PK: 'USER#123', SK: 'RATING#2024-01-01' };
      const cursor = Buffer.from(JSON.stringify(key)).toString('base64url');
      const result = parsePaginationParams(makeEvent({ cursor }));

      expect(result.exclusiveStartKey).toEqual(key);
    });

    it('ignores an invalid (non-base64) cursor', () => {
      const result = parsePaginationParams(makeEvent({ cursor: '!!!invalid!!!' }));

      expect(result.exclusiveStartKey).toBeUndefined();
    });

    it('ignores a cursor with invalid JSON', () => {
      const cursor = Buffer.from('not json').toString('base64url');
      const result = parsePaginationParams(makeEvent({ cursor }));

      expect(result.exclusiveStartKey).toBeUndefined();
    });
  });

  describe('encodeCursor', () => {
    it('returns null when lastEvaluatedKey is undefined', () => {
      expect(encodeCursor(undefined)).toBeNull();
    });

    it('encodes a key to a base64url string that round-trips', () => {
      const key = { PK: 'USER#abc', SK: 'RATING#2024-06-15' };
      const encoded = encodeCursor(key);

      expect(encoded).toBeTypeOf('string');
      const decoded = JSON.parse(Buffer.from(encoded!, 'base64url').toString('utf-8'));
      expect(decoded).toEqual(key);
    });
  });
});
