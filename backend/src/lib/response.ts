import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export function ok(body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(body),
  };
}

export function created(body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(body),
  };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 400,
    headers,
    body: JSON.stringify({ error: message }),
  };
}

export function notFound(message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ error: message }),
  };
}

export function forbidden(message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 403,
    headers,
    body: JSON.stringify({ error: message }),
  };
}

export function serverError(err: unknown): APIGatewayProxyResultV2 {
  console.error('Server error:', err);
  return {
    statusCode: 500,
    headers,
    body: JSON.stringify({ error: 'Internal server error' }),
  };
}
