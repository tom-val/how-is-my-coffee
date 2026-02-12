import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { ok, badRequest, serverError } from '../lib/response.js';
import { verifyPassword } from '../lib/auth.js';

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function unauthorized(): APIGatewayProxyResultV2 {
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify({ error: 'Invalid username or password' }),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const body = JSON.parse(event.body || '{}');
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    const { username, password } = parsed.data;
    const usernameLower = username.toLowerCase();

    // Lookup userId by username
    const usernameResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USERNAME#${usernameLower}`, SK: 'USERNAME' },
      })
    );
    if (!usernameResult.Item) return unauthorized();

    const userId = usernameResult.Item.userId as string;

    // Get user profile with passwordHash
    const profileResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    if (!profileResult.Item) return unauthorized();

    const passwordHash = profileResult.Item.passwordHash as string | undefined;
    if (!passwordHash || !verifyPassword(password, passwordHash)) {
      return unauthorized();
    }

    // Return user without sensitive fields
    const { PK, SK, entityType, passwordHash: _, ...user } = profileResult.Item;
    return ok(user);
  } catch (err) {
    return serverError(err);
  }
}
