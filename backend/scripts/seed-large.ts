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
const passwordHash = hashPassword('coffee123');

// ── Users ──────────────────────────────────────────────────────────
const users = [
  { userId: '11111111-1111-1111-1111-111111111111', username: 'tomas', displayName: 'Tomas' },
  { userId: '22222222-2222-2222-2222-222222222222', username: 'coffee_lover', displayName: 'Coffee Lover' },
  { userId: '33333333-3333-3333-3333-333333333333', username: 'espresso_fan', displayName: 'Espresso Fan' },
  { userId: '44444444-4444-4444-4444-444444444444', username: 'latte_art', displayName: 'Latte Art' },
  { userId: '55555555-5555-5555-5555-555555555555', username: 'barista_joe', displayName: 'Barista Joe' },
];

// ── Places (Vilnius cafés) ─────────────────────────────────────────
const places = [
  { placeId: 'place_cafe_nero', name: 'Caffe Nero', lat: 54.6872, lng: 25.2797, address: 'Gedimino pr. 9, Vilnius' },
  { placeId: 'place_vero_cafe', name: 'Vero Cafe', lat: 54.6892, lng: 25.2800, address: 'Pilies g. 12, Vilnius' },
  { placeId: 'place_caffeine', name: 'Caffeine', lat: 54.6830, lng: 25.2870, address: 'Vilniaus g. 17, Vilnius' },
  { placeId: 'place_crooked_nose', name: 'Crooked Nose & Coffee Stories', lat: 54.6815, lng: 25.2855, address: 'Saviciaus g. 14, Vilnius' },
  { placeId: 'place_augustas', name: 'Augustas Coffee', lat: 54.6900, lng: 25.2750, address: 'Lukiskiu g. 3, Vilnius' },
  { placeId: 'place_taste_map', name: 'Taste Map Coffee', lat: 54.6780, lng: 25.2820, address: 'Pylimo g. 44, Vilnius' },
  { placeId: 'place_soprano', name: 'Soprano Coffee', lat: 54.6850, lng: 25.2910, address: 'Uzupio g. 9, Vilnius' },
  { placeId: 'place_brew', name: 'Brew', lat: 54.6910, lng: 25.2680, address: 'Maironio g. 3, Vilnius' },
  { placeId: 'place_coffeeshark', name: 'Coffee Shark', lat: 54.6860, lng: 25.2760, address: 'Didžioji g. 28, Vilnius' },
  { placeId: 'place_saint_brick', name: 'Saint Brick', lat: 54.6840, lng: 25.2780, address: 'Sv. Ignoto g. 16, Vilnius' },
];

const drinks = [
  'Flat White', 'Espresso', 'Cappuccino', 'Latte',
  'Americano', 'Cortado', 'Mocha', 'Pour Over',
];

const descriptions = [
  'Amazing coffee, will come back!',
  'Pretty good, smooth and balanced.',
  'A bit too bitter for my taste.',
  'Perfect temperature, great crema.',
  'Decent but nothing special.',
  'Best one in town, hands down!',
  'Nice atmosphere, coffee was okay.',
  'Rich and creamy, loved it.',
  'Slightly watery, expected more.',
  'Wow, incredibly aromatic!',
  'Good value for the price.',
  'Smooth with a nice chocolate note.',
  'Too hot, had to wait forever.',
  'Excellent latte art too!',
  'Strong and bold, just how I like it.',
];

// ── Friendships (tomas follows everyone; others follow a few) ─────
const friendships: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], // tomas follows all
  [1, 0], [1, 2],                   // coffee_lover follows tomas + espresso_fan
  [2, 0], [2, 1], [2, 3],           // espresso_fan follows tomas + coffee_lover + latte_art
  [3, 0], [3, 4],                   // latte_art follows tomas + barista_joe
  [4, 0], [4, 1], [4, 2], [4, 3],   // barista_joe follows all
];

// ── Generate ratings ──────────────────────────────────────────────
interface RatingItem {
  ratingId: string;
  userId: string;
  username: string;
  placeId: string;
  placeName: string;
  stars: number;
  drinkName: string;
  description: string;
  lat: number;
  lng: number;
  createdAt: string;
}

const ratings: RatingItem[] = [];
let ratingCounter = 1;

// Generate ~90 ratings: each user visits 4-6 random places, 2-4 drinks each
const startDate = new Date('2025-01-01T08:00:00.000Z');

for (const user of users) {
  // Pick 4-6 random places for this user
  const shuffledPlaces = [...places].sort(() => Math.random() - 0.5);
  const userPlaceCount = 4 + Math.floor(Math.random() * 3); // 4-6
  const userPlaces = shuffledPlaces.slice(0, userPlaceCount);

  for (const place of userPlaces) {
    // 2-4 visits per place
    const visitCount = 2 + Math.floor(Math.random() * 3);
    for (let v = 0; v < visitCount; v++) {
      const daysOffset = Math.floor(Math.random() * 365);
      const hoursOffset = 7 + Math.floor(Math.random() * 12); // 7am-7pm
      const date = new Date(startDate.getTime() + daysOffset * 86400000 + hoursOffset * 3600000);

      const drink = drinks[Math.floor(Math.random() * drinks.length)];
      const stars = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5][Math.floor(Math.random() * 9)];
      const desc = descriptions[Math.floor(Math.random() * descriptions.length)];

      ratings.push({
        ratingId: `r${ratingCounter++}`,
        userId: user.userId,
        username: user.username,
        placeId: place.placeId,
        placeName: place.name,
        stars,
        drinkName: drink,
        description: desc,
        lat: place.lat,
        lng: place.lng,
        createdAt: date.toISOString(),
      });
    }
  }
}

console.log(`Generated ${ratings.length} ratings across ${users.length} users and ${places.length} places`);

// ── Build DynamoDB items ──────────────────────────────────────────
const items: Record<string, unknown>[] = [];

// 1. User profiles + username index
for (const user of users) {
  items.push({
    PK: `USER#${user.userId}`, SK: 'PROFILE',
    userId: user.userId, username: user.username, displayName: user.displayName,
    passwordHash, createdAt: '2025-01-01T00:00:00.000Z', entityType: 'User',
  });
  items.push({
    PK: `USERNAME#${user.username}`, SK: 'USERNAME',
    userId: user.userId, entityType: 'UsernameIndex',
  });
}

// 2. Friendships
for (const [fromIdx, toIdx] of friendships) {
  const from = users[fromIdx];
  const to = users[toIdx];
  items.push({
    PK: `USER#${from.userId}`, SK: `FRIEND#${to.userId}`,
    friendUserId: to.userId, friendUsername: to.username, friendDisplayName: to.displayName,
    addedAt: '2025-01-01T00:00:00.000Z', entityType: 'Friend',
  });
}

// 3. Ratings (USER# copy + PLACE# copy + RATING#/META copy)
for (const r of ratings) {
  // USER# copy
  items.push({
    PK: `USER#${r.userId}`, SK: `RATING#${r.createdAt}#${r.ratingId}`,
    ratingId: r.ratingId, userId: r.userId, username: r.username,
    placeId: r.placeId, placeName: r.placeName,
    stars: r.stars, drinkName: r.drinkName, description: r.description,
    lat: r.lat, lng: r.lng, createdAt: r.createdAt,
    likeCount: 0, commentCount: 0, entityType: 'Rating',
  });
  // PLACE# copy
  items.push({
    PK: `PLACE#${r.placeId}`, SK: `RATING#${r.createdAt}#${r.ratingId}`,
    ratingId: r.ratingId, userId: r.userId, username: r.username, stars: r.stars,
    drinkName: r.drinkName, description: r.description,
    placeId: r.placeId, placeName: r.placeName,
    createdAt: r.createdAt, likeCount: 0, commentCount: 0,
    entityType: 'PlaceRating',
  });
  // RATING# META copy (co-locates likes + comments)
  items.push({
    PK: `RATING#${r.ratingId}`, SK: 'META',
    ratingId: r.ratingId, userId: r.userId, username: r.username,
    placeId: r.placeId, placeName: r.placeName,
    stars: r.stars, drinkName: r.drinkName, description: r.description,
    lat: r.lat, lng: r.lng, createdAt: r.createdAt,
    likeCount: 0, commentCount: 0, entityType: 'RatingMeta',
  });
}

// 4. UserPlace items (track which places each user visited)
const userPlaceMap = new Map<string, { userId: string; placeId: string; placeName: string; lat: number; lng: number; address: string; lastVisited: string; visitCount: number }>();

for (const r of ratings) {
  const key = `${r.userId}#${r.placeId}`;
  const place = places.find((p) => p.placeId === r.placeId)!;
  const existing = userPlaceMap.get(key);
  if (!existing) {
    userPlaceMap.set(key, {
      userId: r.userId, placeId: r.placeId, placeName: r.placeName,
      lat: r.lat, lng: r.lng, address: place.address,
      lastVisited: r.createdAt, visitCount: 1,
    });
  } else {
    existing.visitCount++;
    if (new Date(r.createdAt) > new Date(existing.lastVisited)) {
      existing.lastVisited = r.createdAt;
    }
  }
}

for (const up of userPlaceMap.values()) {
  items.push({
    PK: `USER#${up.userId}`, SK: `PLACE#${up.placeId}`,
    placeId: up.placeId, placeName: up.placeName, lat: up.lat, lng: up.lng,
    address: up.address, lastVisited: up.lastVisited, visitCount: up.visitCount,
    entityType: 'UserPlace',
  });
}

// 5. Place META (compute avg using only latest rating per user)
const placeRatingsMap = new Map<string, RatingItem[]>();
for (const r of ratings) {
  if (!placeRatingsMap.has(r.placeId)) placeRatingsMap.set(r.placeId, []);
  placeRatingsMap.get(r.placeId)!.push(r);
}

for (const place of places) {
  const placeRatings = placeRatingsMap.get(place.placeId) || [];
  if (placeRatings.length === 0) continue;

  // Sort newest first
  placeRatings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Latest per user
  const latestByUser = new Map<string, number>();
  for (const r of placeRatings) {
    if (!latestByUser.has(r.userId)) latestByUser.set(r.userId, r.stars);
  }

  const values = Array.from(latestByUser.values());
  const avgRating = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;

  items.push({
    PK: `PLACE#${place.placeId}`, SK: 'META',
    placeId: place.placeId, name: place.name, lat: place.lat, lng: place.lng,
    address: place.address, avgRating, ratingCount: values.length,
    entityType: 'Place',
  });
}

// ── Write all items ────────────────────────────────────────────────
let written = 0;
for (const item of items) {
  await dynamo.send(new PutCommand({ TableName: TABLE, Item: item }));
  written++;
  if (written % 50 === 0) console.log(`  Written ${written}/${items.length} items...`);
}

console.log(`Seeded ${items.length} items successfully (${ratings.length} ratings)`);
