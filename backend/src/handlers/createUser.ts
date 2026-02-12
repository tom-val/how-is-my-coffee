import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { created, badRequest, serverError } from '../lib/response.js';
import { hashPassword } from '../lib/auth.js';

const CreateUserSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(50),
  password: z.string().min(6).max(100),
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const body = JSON.parse(event.body || '{}');
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    const { username, displayName, password } = parsed.data;
    const usernameLower = username.toLowerCase();

    // Check if username already taken
    const existing = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USERNAME#${usernameLower}`, SK: 'USERNAME' },
      })
    );
    if (existing.Item) return badRequest('Username already taken');

    const userId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const passwordHash = hashPassword(password);

    // Create user profile + username reservation
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
          userId,
          username: usernameLower,
          displayName,
          passwordHash,
          createdAt,
          entityType: 'User',
        },
      })
    );

    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USERNAME#${usernameLower}`,
          SK: 'USERNAME',
          userId,
          entityType: 'UsernameIndex',
        },
      })
    );

    return created({ userId, username: usernameLower, displayName, createdAt });
  } catch (err) {
    return serverError(err);
  }
}
