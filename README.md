# How is my coffee?

A mobile-first web app for rating your coffee experiences. Track ratings, discover places, and share with friends.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Docker](https://www.docker.com/) (for local DynamoDB and S3-compatible storage)
- [AWS CLI](https://aws.amazon.com/cli/) (for deployment)

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env

# 3. Start infrastructure (DynamoDB Local + MinIO)
npm run infra:up

# 4. Create database table
npm run db:create-tables

# 5. (Optional) Load sample data
npm run db:seed          # Small seed: 2 users, 4 ratings
npm run db:seed-large    # Large seed: 5 users, ~80 ratings (good for testing pagination)

# 6. Start development servers
npm run dev
```

The app will be available at **http://localhost:5173**.

### Seed Data Credentials

All seed users have the password `coffee123`.

| User | Username | Small seed | Large seed |
|---|---|---|---|
| Tomas | `tomas` | Yes | Yes |
| Coffee Lover | `coffee_lover` | Yes | Yes |
| Espresso Fan | `espresso_fan` | No | Yes |
| Latte Art | `latte_art` | No | Yes |
| Barista Joe | `barista_joe` | No | Yes |

## Deployment to AWS

The app is designed for a serverless AWS deployment. Each backend handler is a standalone Lambda function, the frontend is a static SPA, and all data lives in DynamoDB + S3.

### Architecture Overview

```
                   CloudFront (CDN)
                   /              \
          S3 Bucket (SPA)    API Gateway / Lambda Function URLs
                               |
                          Lambda Functions (one per handler)
                               |
                    DynamoDB          S3 (photos)
```

### Step 1: Create AWS Resources

#### DynamoDB Table

```bash
aws dynamodb create-table \
  --table-name CoffeeApp \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

#### S3 Bucket for Photos

```bash
# Create bucket
aws s3 mb s3://your-coffee-app-photos --region us-east-1

# Set CORS policy for presigned uploads
aws s3api put-bucket-cors --bucket your-coffee-app-photos --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-domain.com"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}'
```

### Step 2: Deploy Lambda Functions

Each file in `backend/src/handlers/` exports a `handler` function compatible with AWS Lambda Function URLs (APIGatewayProxyEventV2 signature).

| Handler | Method | Path | Description |
|---|---|---|---|
| `createUser.ts` | POST | `/api/users` | Register a new user |
| `loginUser.ts` | POST | `/api/auth/login` | Login with username/password |
| `getUser.ts` | GET | `/api/users/:username` | Get user by username |
| `createRating.ts` | POST | `/api/ratings` | Create a coffee rating |
| `getUserRatings.ts` | GET | `/api/users/:userId/ratings` | Get paginated user ratings |
| `getPlaceRatings.ts` | GET | `/api/places/:placeId/ratings` | Get paginated place ratings |
| `getPlaces.ts` | GET | `/api/users/:userId/places` | Get places visited by user |
| `getPlace.ts` | GET | `/api/places/:placeId` | Get place metadata |
| `addFriend.ts` | POST | `/api/friends` | Follow a user by username |
| `getFriends.ts` | GET | `/api/users/:userId/friends` | Get friend list |
| `getFeed.ts` | GET | `/api/feed` | Get paginated friends feed |
| `getPresignedUrl.ts` | POST | `/api/photos/upload-url` | Get S3 presigned upload URL |

#### Build & Bundle

Lambda functions need to be bundled (TypeScript compiled, dependencies included). You can use `esbuild` or `tsup`:

```bash
# Example with esbuild (install: npm i -D esbuild)
npx esbuild backend/src/handlers/createRating.ts \
  --bundle --platform=node --target=node20 \
  --outfile=dist/createRating.js --format=esm --external:@aws-sdk/*
```

The `@aws-sdk/*` packages are available in the Lambda runtime and don't need bundling.

#### Lambda Environment Variables

Set these environment variables on each Lambda function:

```
AWS_REGION=us-east-1
S3_BUCKET=your-coffee-app-photos
S3_REGION=us-east-1
```

Note: `DYNAMODB_ENDPOINT` and `S3_ENDPOINT` should **not** be set in production -- the SDK auto-discovers real AWS endpoints.

#### IAM Role Permissions

Each Lambda needs a role with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/CoffeeApp"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::your-coffee-app-photos/*"
    }
  ]
}
```

### Step 3: Set Up API Gateway or Lambda Function URLs

**Option A: Lambda Function URLs** (simpler)

Enable Function URLs on each Lambda with `AUTH_TYPE=NONE` (the app handles auth via `x-user-id` header). You'll need a CloudFront distribution to route paths to the correct functions.

**Option B: API Gateway HTTP API** (recommended)

Create an HTTP API in API Gateway and configure routes to match the table above. This gives you a single API endpoint with path-based routing.

```bash
# Example: create HTTP API
aws apigatewayv2 create-api \
  --name coffee-app-api \
  --protocol-type HTTP
```

Then add Lambda integrations for each route.

### Step 4: Build & Deploy Frontend

```bash
# Build the frontend
cd frontend
VITE_API_URL=https://your-api-domain.com/api npm run build
```

This produces a `dist/` folder with static files. The `VITE_API_URL` variable tells the frontend where the API lives (in local dev it defaults to `/api` and the Vite proxy forwards to the backend).

#### Host on S3 + CloudFront

```bash
# Create S3 bucket for hosting
aws s3 mb s3://your-coffee-app-frontend

# Upload build output
aws s3 sync frontend/dist/ s3://your-coffee-app-frontend/ --delete

# Enable static website hosting
aws s3 website s3://your-coffee-app-frontend/ \
  --index-document index.html \
  --error-document index.html
```

Create a CloudFront distribution pointing to the S3 bucket. Set the error page to `index.html` with status 200 (required for SPA client-side routing).

#### Alternative: Vercel / Netlify

You can also deploy the frontend to Vercel or Netlify. Set the build command to `cd frontend && npm run build`, output directory to `frontend/dist`, and add the `VITE_API_URL` environment variable.

Add a redirect rule for SPA routing:
```
/*    /index.html   200
```

### Step 5: CORS Configuration

If the API and frontend are on different domains, ensure your API Gateway or Lambda responses include CORS headers:

```
Access-Control-Allow-Origin: https://your-domain.com
Access-Control-Allow-Headers: Content-Type, x-user-id
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

The backend `response.ts` helper already includes CORS headers with `*` origin. For production, restrict this to your actual domain.

### Infrastructure as Code (Optional)

For a more reproducible deployment, consider using:

- **AWS SAM** (`template.yaml`) -- native Lambda/API Gateway support
- **AWS CDK** -- TypeScript-based infrastructure
- **Terraform** -- provider-agnostic IaC

## Environment Variables

### Local Development (`.env`)

```env
DYNAMODB_ENDPOINT=http://localhost:8000
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=coffee-app-photos
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
AWS_REGION=us-east-1
```

### Production (Lambda)

```env
AWS_REGION=us-east-1
S3_BUCKET=your-coffee-app-photos
S3_REGION=us-east-1
```

### Frontend Build

```env
VITE_API_URL=https://your-api-domain.com/api
```

## Project Structure

```
coffee-app/
├── package.json              # Monorepo root (npm workspaces)
├── docker-compose.yml        # DynamoDB Local + MinIO
├── .env                      # Environment variables (local)
│
├── frontend/                 # React + Vite + TypeScript + TailwindCSS
│   ├── src/
│   │   ├── api/client.ts     # API client with pagination support
│   │   ├── context/          # Auth context
│   │   ├── components/       # StarRating, RatingCard, BottomNav
│   │   ├── pages/            # All application pages
│   │   └── hooks/            # useGeolocation, useIntersectionObserver
│   └── vite.config.ts
│
├── backend/                  # Lambda handlers + Express local server
│   ├── local-server.ts       # Express adapter for local development
│   ├── src/
│   │   ├── handlers/         # Lambda function handlers
│   │   └── lib/              # DynamoDB, S3, response, auth, pagination helpers
│   └── scripts/
│       ├── create-tables.ts  # DynamoDB table creation
│       ├── seed-data.ts      # Small sample data
│       └── seed-large.ts     # Large sample data (~80 ratings)
```

## npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start both backend and frontend dev servers |
| `npm run dev:backend` | Start backend only (port 3001) |
| `npm run dev:frontend` | Start frontend only (port 5173) |
| `npm run infra:up` | Start Docker containers (DynamoDB + MinIO) |
| `npm run infra:down` | Stop Docker containers |
| `npm run db:create-tables` | Create the DynamoDB table |
| `npm run db:seed` | Load small sample data (2 users, 4 ratings) |
| `npm run db:seed-large` | Load large sample data (5 users, ~80 ratings) |
| `npm run setup` | Full setup: install + infra + create tables |

## Infrastructure

### Docker Services (Local)

| Service | Port | Description |
|---|---|---|
| DynamoDB Local | 8000 | Local DynamoDB instance |
| MinIO | 9000 | S3-compatible object storage |
| MinIO Console | 9001 | MinIO web UI (user: `minioadmin`, pass: `minioadmin`) |

### DynamoDB Table

Single table `CoffeeApp` with the following entity types:

| Entity | PK | SK |
|---|---|---|
| User Profile | `USER#<userId>` | `PROFILE` |
| Rating | `USER#<userId>` | `RATING#<timestamp>#<ratingId>` |
| User Place | `USER#<userId>` | `PLACE#<placeId>` |
| Friend | `USER#<userId>` | `FRIEND#<friendUserId>` |
| Place Meta | `PLACE#<placeId>` | `META` |
| Place Rating | `PLACE#<placeId>` | `RATING#<timestamp>#<ratingId>` |
| Username Lookup | `USERNAME#<username>` | `USERNAME` |

## API Endpoints

All endpoints are served at `http://localhost:3001/api` during local development. The frontend proxies `/api` requests to the backend automatically.

Paginated endpoints accept `?limit=10&cursor=<token>` query parameters and return `{ ratings, nextCursor }`.

| Method | Path | Description | Paginated |
|---|---|---|---|
| POST | `/api/users` | Register a new user | No |
| POST | `/api/auth/login` | Login with password | No |
| GET | `/api/users/:username` | Get user by username | No |
| POST | `/api/ratings` | Create a coffee rating | No |
| GET | `/api/users/:userId/ratings` | Get ratings by a user | Yes |
| GET | `/api/places/:placeId/ratings` | Get ratings for a place | Yes |
| GET | `/api/feed` | Get friends feed | Yes |
| GET | `/api/users/:userId/places` | Get places visited by user | No |
| GET | `/api/places/:placeId` | Get place metadata | No |
| POST | `/api/friends` | Follow a user by username | No |
| GET | `/api/users/:userId/friends` | Get friend list | No |
| POST | `/api/photos/upload-url` | Get S3 presigned upload URL | No |

### Authentication

Requests are authenticated via the `x-user-id` header containing the user's UUID. This is set automatically by the frontend after login. Passwords are hashed with scrypt + random salt.

## Features

- **Rate coffee** with 1-5 stars (0.5 increments), drink name, photo, and description
- **GPS location** detection with reverse geocoding (Nominatim/OpenStreetMap)
- **Address auto-detection** from GPS coordinates
- **Infinite scroll** with cursor-based pagination on all rating lists
- **Friends feed** showing coffees from people you follow
- **Per-drink averages** on place detail pages
- **Place ratings** use only each user's latest rating
- **My Coffees** personal rating history
- **Places** map view (Leaflet/OpenStreetMap) and list of visited cafes
- **Place Detail** aggregate rating, drink breakdown, and all reviews
- **Friends** follow by username, view their ratings
- **Share profile** public link at `/u/<username>`
- **Place autocomplete** from previously visited places when rating

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, TailwindCSS v4, React Router, TanStack Query v5 |
| Maps | Leaflet + react-leaflet + OpenStreetMap tiles |
| Geocoding | Nominatim (OpenStreetMap reverse geocoding) |
| Backend | AWS Lambda handlers (Express adapter for local dev) |
| Database | DynamoDB (single-table design, PAY_PER_REQUEST) |
| Storage | S3 / MinIO (presigned URL uploads) |
| Auth | scrypt password hashing, x-user-id header |
| Validation | Zod |
