import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { hashPassword } from '../src/lib/auth.js';

const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const dynamo = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = 'CoffeeApp';

const userId1 = '11111111-1111-1111-1111-111111111111';
const userId2 = '22222222-2222-2222-2222-222222222222';

// Seed password for both users: "coffee123"
const seedPasswordHash = hashPassword('coffee123');

const items = [
  // User 1
  {
    PK: `USER#${userId1}`, SK: 'PROFILE',
    userId: userId1, username: 'tomas', displayName: 'Tomas', passwordHash: seedPasswordHash, totalCaffeineMg: 323, createdAt: '2025-01-01T00:00:00.000Z', entityType: 'User',
  },
  { PK: 'USERNAME#tomas', SK: 'USERNAME', userId: userId1, entityType: 'UsernameIndex' },

  // User 2
  {
    PK: `USER#${userId2}`, SK: 'PROFILE',
    userId: userId2, username: 'coffee_lover', displayName: 'Coffee Lover', passwordHash: seedPasswordHash, totalCaffeineMg: 130, createdAt: '2025-01-02T00:00:00.000Z', entityType: 'User',
  },
  { PK: 'USERNAME#coffee_lover', SK: 'USERNAME', userId: userId2, entityType: 'UsernameIndex' },

  // Friendship
  {
    PK: `USER#${userId1}`, SK: `FRIEND#${userId2}`,
    friendUserId: userId2, friendUsername: 'coffee_lover', friendDisplayName: 'Coffee Lover',
    addedAt: '2025-01-03T00:00:00.000Z', entityType: 'Friend',
  },

  // Ratings for User 1
  {
    PK: `USER#${userId1}`, SK: 'RATING#2025-01-10T09:00:00.000Z#r1',
    ratingId: 'r1', userId: userId1, placeId: 'place_cafe_nero', placeName: 'Caffe Nero',
    stars: 4.5, drinkName: 'Flat White', description: 'Excellent flat white, smooth and creamy', caffeineMg: 130, lat: 54.6872, lng: 25.2797,
    createdAt: '2025-01-10T09:00:00.000Z', entityType: 'Rating',
  },
  {
    PK: `USER#${userId1}`, SK: 'RATING#2025-01-15T10:30:00.000Z#r2',
    ratingId: 'r2', userId: userId1, placeId: 'place_vero_cafe', placeName: 'Vero Cafe',
    stars: 3.5, drinkName: 'Cappuccino', description: 'Good cappuccino but a bit lukewarm', caffeineMg: 130, lat: 54.6892, lng: 25.2800,
    createdAt: '2025-01-15T10:30:00.000Z', entityType: 'Rating',
  },
  {
    PK: `USER#${userId1}`, SK: 'RATING#2025-02-01T08:00:00.000Z#r3',
    ratingId: 'r3', userId: userId1, placeId: 'place_cafe_nero', placeName: 'Caffe Nero',
    stars: 5, drinkName: 'Espresso', description: 'The best espresso I have ever had!', caffeineMg: 63, lat: 54.6872, lng: 25.2797,
    createdAt: '2025-02-01T08:00:00.000Z', entityType: 'Rating',
  },

  // Place ratings (denormalized)
  {
    PK: 'PLACE#place_cafe_nero', SK: 'RATING#2025-01-10T09:00:00.000Z#r1',
    ratingId: 'r1', userId: userId1, username: 'tomas', stars: 4.5,
    drinkName: 'Flat White', description: 'Excellent flat white, smooth and creamy', caffeineMg: 130,
    createdAt: '2025-01-10T09:00:00.000Z', entityType: 'PlaceRating',
  },
  {
    PK: 'PLACE#place_cafe_nero', SK: 'RATING#2025-02-01T08:00:00.000Z#r3',
    ratingId: 'r3', userId: userId1, username: 'tomas', stars: 5,
    drinkName: 'Espresso', description: 'The best espresso I have ever had!', caffeineMg: 63,
    createdAt: '2025-02-01T08:00:00.000Z', entityType: 'PlaceRating',
  },
  {
    PK: 'PLACE#place_vero_cafe', SK: 'RATING#2025-01-15T10:30:00.000Z#r2',
    ratingId: 'r2', userId: userId1, username: 'tomas', stars: 3.5,
    drinkName: 'Cappuccino', description: 'Good cappuccino but a bit lukewarm', caffeineMg: 130,
    createdAt: '2025-01-15T10:30:00.000Z', entityType: 'PlaceRating',
  },

  // Place META
  {
    PK: 'PLACE#place_cafe_nero', SK: 'META',
    placeId: 'place_cafe_nero', name: 'Caffe Nero', lat: 54.6872, lng: 25.2797,
    address: 'Gedimino pr. 9, Vilnius', avgRating: 4.5, ratingCount: 2, entityType: 'Place',
  },
  {
    PK: 'PLACE#place_vero_cafe', SK: 'META',
    placeId: 'place_vero_cafe', name: 'Vero Cafe', lat: 54.6892, lng: 25.2800,
    address: 'Pilies g. 12, Vilnius', avgRating: 3.5, ratingCount: 1, entityType: 'Place',
  },

  // UserPlace items
  {
    PK: `USER#${userId1}`, SK: 'PLACE#place_cafe_nero',
    placeId: 'place_cafe_nero', placeName: 'Caffe Nero', lat: 54.6872, lng: 25.2797,
    address: 'Gedimino pr. 9, Vilnius', lastVisited: '2025-02-01T08:00:00.000Z',
    visitCount: 2, entityType: 'UserPlace',
  },
  {
    PK: `USER#${userId1}`, SK: 'PLACE#place_vero_cafe',
    placeId: 'place_vero_cafe', placeName: 'Vero Cafe', lat: 54.6892, lng: 25.2800,
    address: 'Pilies g. 12, Vilnius', lastVisited: '2025-01-15T10:30:00.000Z',
    visitCount: 1, entityType: 'UserPlace',
  },

  // Ratings for User 2
  {
    PK: `USER#${userId2}`, SK: 'RATING#2025-01-20T14:00:00.000Z#r4',
    ratingId: 'r4', userId: userId2, placeId: 'place_cafe_nero', placeName: 'Caffe Nero',
    stars: 4, drinkName: 'Latte', description: 'Solid coffee, nice atmosphere', caffeineMg: 130, lat: 54.6872, lng: 25.2797,
    createdAt: '2025-01-20T14:00:00.000Z', entityType: 'Rating',
  },
  {
    PK: 'PLACE#place_cafe_nero', SK: 'RATING#2025-01-20T14:00:00.000Z#r4',
    ratingId: 'r4', userId: userId2, username: 'coffee_lover', stars: 4,
    drinkName: 'Latte', description: 'Solid coffee, nice atmosphere', caffeineMg: 130,
    createdAt: '2025-01-20T14:00:00.000Z', entityType: 'PlaceRating',
  },
  {
    PK: `USER#${userId2}`, SK: 'PLACE#place_cafe_nero',
    placeId: 'place_cafe_nero', placeName: 'Caffe Nero', lat: 54.6872, lng: 25.2797,
    address: 'Gedimino pr. 9, Vilnius', lastVisited: '2025-01-20T14:00:00.000Z',
    visitCount: 1, entityType: 'UserPlace',
  },
];

for (const item of items) {
  await dynamo.send(new PutCommand({ TableName: TABLE, Item: item }));
}

console.log(`Seeded ${items.length} items successfully`);
