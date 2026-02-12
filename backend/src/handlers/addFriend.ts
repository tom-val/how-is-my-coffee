import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamo, TABLE_NAME } from '../lib/dynamo.js';
import { created, badRequest, notFound, serverError } from '../lib/response.js';

const Schema = z.object({
  friendUsername: z.string().min(1),
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = event.headers['x-user-id'];
    if (!userId) return badRequest('Missing x-user-id header');

    const body = JSON.parse(event.body || '{}');
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    const friendUsernameLower = parsed.data.friendUsername.toLowerCase();

    // Lookup friend by username
    const usernameResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USERNAME#${friendUsernameLower}`, SK: 'USERNAME' },
      })
    );
    if (!usernameResult.Item) return notFound('User not found');

    const friendUserId = usernameResult.Item.userId as string;

    if (friendUserId === userId) return badRequest('Cannot add yourself as a friend');

    // Get friend profile for display name
    const friendProfile = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${friendUserId}`, SK: 'PROFILE' },
      })
    );
    const friendDisplayName = (friendProfile.Item?.displayName as string) || friendUsernameLower;

    // Get current user's profile for the reverse follower record
    const currentUserProfile = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    const currentUsername = (currentUserProfile.Item?.username as string) || '';
    const currentDisplayName = (currentUserProfile.Item?.displayName as string) || currentUsername;

    const now = new Date().toISOString();

    // Write FRIEND# record on current user's partition
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `FRIEND#${friendUserId}`,
          friendUserId,
          friendUsername: friendUsernameLower,
          friendDisplayName,
          addedAt: now,
          entityType: 'Friend',
        },
      })
    );

    // Write reverse FOLLOWER# record on friend's partition
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${friendUserId}`,
          SK: `FOLLOWER#${userId}`,
          followerUserId: userId,
          followerUsername: currentUsername,
          followerDisplayName: currentDisplayName,
          followedAt: now,
          entityType: 'Follower',
        },
      })
    );

    return created({ friendUserId, friendUsername: friendUsernameLower, friendDisplayName });
  } catch (err) {
    return serverError(err);
  }
}
