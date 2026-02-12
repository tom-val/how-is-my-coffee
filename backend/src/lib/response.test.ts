import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ok, created, badRequest, notFound, serverError } from './response.js';

// All response helpers return the structured variant, not a plain string
type Result = APIGatewayProxyStructuredResultV2;

const expectedHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

describe('response', () => {
  describe('ok', () => {
    it('returns 200 with JSON body and CORS headers', () => {
      const result = ok({ message: 'hello' }) as Result;

      expect(result.statusCode).toBe(200);
      expect(result.headers).toEqual(expectedHeaders);
      expect(JSON.parse(result.body as string)).toEqual({ message: 'hello' });
    });
  });

  describe('created', () => {
    it('returns 201 with JSON body and CORS headers', () => {
      const result = created({ id: '123' }) as Result;

      expect(result.statusCode).toBe(201);
      expect(result.headers).toEqual(expectedHeaders);
      expect(JSON.parse(result.body as string)).toEqual({ id: '123' });
    });
  });

  describe('badRequest', () => {
    it('returns 400 with error message', () => {
      const result = badRequest('Invalid input') as Result;

      expect(result.statusCode).toBe(400);
      expect(result.headers).toEqual(expectedHeaders);
      expect(JSON.parse(result.body as string)).toEqual({ error: 'Invalid input' });
    });
  });

  describe('notFound', () => {
    it('returns 404 with error message', () => {
      const result = notFound('Not found') as Result;

      expect(result.statusCode).toBe(404);
      expect(result.headers).toEqual(expectedHeaders);
      expect(JSON.parse(result.body as string)).toEqual({ error: 'Not found' });
    });
  });

  describe('serverError', () => {
    it('returns 500 with generic error message', () => {
      const result = serverError(new Error('something broke')) as Result;

      expect(result.statusCode).toBe(500);
      expect(result.headers).toEqual(expectedHeaders);
      expect(JSON.parse(result.body as string)).toEqual({ error: 'Internal server error' });
    });
  });
});
