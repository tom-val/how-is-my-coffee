import express from 'express';
import cors from 'cors';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import 'dotenv/config';

import { handler as createUser } from './src/handlers/createUser.js';
import { handler as getUser } from './src/handlers/getUser.js';
import { handler as createRating } from './src/handlers/createRating.js';
import { handler as getUserRatings } from './src/handlers/getUserRatings.js';
import { handler as getPlaceRatings } from './src/handlers/getPlaceRatings.js';
import { handler as getPlaces } from './src/handlers/getPlaces.js';
import { handler as getPlace } from './src/handlers/getPlace.js';
import { handler as addFriend } from './src/handlers/addFriend.js';
import { handler as getFriends } from './src/handlers/getFriends.js';
import { handler as getFollowers } from './src/handlers/getFollowers.js';
import { handler as getPresignedUrl } from './src/handlers/getPresignedUrl.js';
import { handler as loginUser } from './src/handlers/loginUser.js';
import { handler as getFeed } from './src/handlers/getFeed.js';
import { handler as getCaffeineStats } from './src/handlers/getCaffeineStats.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

type LambdaHandler = (event: APIGatewayProxyEventV2) => Promise<unknown>;

function adapt(handler: LambdaHandler) {
  return async (req: express.Request, res: express.Response) => {
    const event = {
      requestContext: {
        http: { method: req.method, path: req.path },
      },
      headers: req.headers as Record<string, string>,
      queryStringParameters: req.query as Record<string, string>,
      pathParameters: req.params,
      body: JSON.stringify(req.body),
      isBase64Encoded: false,
    } as unknown as APIGatewayProxyEventV2;

    const result = (await handler(event)) as {
      statusCode: number;
      headers?: Record<string, string>;
      body?: string;
    };

    if (result.headers) {
      Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
    }
    res.status(result.statusCode).send(result.body);
  };
}

// Auth routes
app.post('/api/users', adapt(createUser));
app.post('/api/auth/login', adapt(loginUser));
app.get('/api/users/:username', adapt(getUser));

// Rating routes
app.post('/api/ratings', adapt(createRating));
app.get('/api/users/:userId/ratings', adapt(getUserRatings));

// Place routes
app.get('/api/places/:placeId/ratings', adapt(getPlaceRatings));
app.get('/api/users/:userId/places', adapt(getPlaces));
app.get('/api/places/:placeId', adapt(getPlace));

// Friend routes
app.post('/api/friends', adapt(addFriend));
app.get('/api/users/:userId/friends', adapt(getFriends));
app.get('/api/users/:userId/followers', adapt(getFollowers));

// Feed route
app.get('/api/feed', adapt(getFeed));

// Caffeine route
app.get('/api/users/:userId/caffeine', adapt(getCaffeineStats));

// Photo routes
app.post('/api/photos/upload-url', adapt(getPresignedUrl));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Local API server running on http://localhost:${PORT}`);
});
