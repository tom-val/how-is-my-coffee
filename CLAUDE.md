# Coffee App

A mobile-first coffee rating app. Users rate drinks at cafés, track caffeine intake, and follow friends' ratings.

## Quick Start

```bash
npm run setup          # install deps, start Docker, create DynamoDB tables
npm run db:seed        # seed local DynamoDB with test data
npm run dev            # start backend (3001) + frontend (7173) concurrently
```

## Tech Stack

- **Frontend:** React 19, Vite 7, TypeScript, TailwindCSS v4, TanStack Query v5, React Router v7
- **Backend:** AWS Lambda (Node.js 20), Express adapter for local dev
- **Database:** DynamoDB single-table design (table: `CoffeeApp`)
- **Storage:** S3 (MinIO locally) for photo uploads
- **Infrastructure:** Terraform (AWS provider 5.82.2), API Gateway HTTP API, CloudFront CDN
- **Testing:** Vitest 3.0.5
- **CI/CD:** GitHub Actions — CI on PRs (lint, type-check, test, build, terraform plan), CD on main (terraform apply, S3 sync, CloudFront invalidation)

## Project Structure

```
├── frontend/                 # React Vite SPA
│   └── src/
│       ├── api/client.ts     # API client with x-user-id auth header
│       ├── components/       # BottomNav, RatingCard, StarRating
│       ├── context/          # AuthContext (login state, localStorage persistence)
│       ├── hooks/            # useAuth, useGeolocation, useIntersectionObserver, useToggleLike
│       ├── lib/              # caffeine.ts (static lookup), resizeImage.ts
│       ├── pages/            # 9 page components
│       └── types/index.ts    # Shared frontend types
├── backend/
│   ├── local-server.ts       # Express adapter: maps req/res → Lambda event format
│   ├── scripts/              # create-tables.ts, seed-data.ts, seed-large.ts
│   └── src/
│       ├── handlers/         # One Lambda handler per file + co-located .test.ts
│       └── lib/              # dynamo, auth, response, s3, pagination, likes, openai
├── terraform/                # AWS infrastructure (Lambda, API GW, DynamoDB, S3, CloudFront)
├── scripts/build-lambdas.sh  # esbuild bundler → dist/lambdas/*.zip
└── docker-compose.yml        # DynamoDB Local (8000), MinIO (9000/9001)
```

## Architecture

### Frontend

- **Routing:** React Router v7 with `ProtectedLayout` wrapper. Public route: `/u/:username`.
- **State:** AuthContext for session (userId in localStorage + `x-user-id` header). TanStack Query for server state with cursor-based infinite queries.
- **Styling:** TailwindCSS v4 (`@import "tailwindcss"` syntax). Mobile-first, max-width 500px. Colour palette: amber/stone/brown (#6F4E37).
- **Hooks:** `useToggleLike` does optimistic updates across feed, userRatings, placeRatings, and ratingDetail query caches.
- **API client:** `frontend/src/api/client.ts` — all methods, BASE_URL from `VITE_API_URL` env or `/api` (Vite proxies to backend).

### Backend

- **Handler pattern:** Each handler is `async (event: APIGatewayProxyEventV2) => APIGatewayProxyResultV2`. Zod validates input. Response helpers: `ok()`, `created()`, `badRequest()`, `notFound()`, `serverError()`.
- **Auth:** `x-user-id` header. Passwords hashed with scrypt + random salt in `lib/auth.ts`.
- **Local dev:** `local-server.ts` adapts Express to Lambda event format — same handlers run locally and in AWS.
- **OpenAI:** `lib/openai.ts` — `resolveWithAi()` estimates caffeine content via GPT-5 mini (15s timeout, graceful fallback to null).

### DynamoDB Single-Table Design

Table: `CoffeeApp` (PK + SK, PAY_PER_REQUEST)

| Entity | PK | SK |
|---|---|---|
| User profile | `USER#<userId>` | `PROFILE` |
| User rating | `USER#<userId>` | `RATING#<timestamp>#<ratingId>` |
| User place | `USER#<userId>` | `PLACE#<placeId>` |
| Friend | `USER#<userId>` | `FRIEND#<friendUserId>` |
| Follower | `USER#<userId>` | `FOLLOWER#<followerUserId>` |
| Rating detail | `RATING#<ratingId>` | `META` |
| Like | `RATING#<ratingId>` | `LIKE#<userId>` |
| Comment | `RATING#<ratingId>` | `COMMENT#<timestamp>#<commentId>` |
| Place detail | `PLACE#<placeId>` | `META` |
| Place rating | `PLACE#<placeId>` | `RATING#<timestamp>#<ratingId>` |
| Username lookup | `USERNAME#<username>` | `USERNAME` |

Ratings are denormalised across three PK patterns (USER#, PLACE#, RATING#) via `TransactWrite` in `createRating`.

### Infrastructure

- **Lambda:** 16 handlers, esbuild-bundled to ESM, 256MB, 10s default timeout (20s for AI calls). Shared IAM role with DynamoDB + S3 permissions.
- **API Gateway:** HTTP API (v2) with CORS. Routes map 1:1 to Lambda functions via Terraform `for_each`.
- **CloudFront:** Serves frontend SPA from S3 (OAC), proxies `/api/*` to API Gateway, caches `/uploads/*` photos.
- **State:** S3 backend + DynamoDB lock table for Terraform state.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start backend + frontend concurrently |
| `npm run dev:backend` | Backend only (tsx watch, port 3001) |
| `npm run dev:frontend` | Frontend only (Vite, port 7173) |
| `npm run infra:up` | Start Docker Compose (DynamoDB + MinIO) |
| `npm run infra:down` | Stop Docker Compose |
| `npm run db:create-tables` | Create DynamoDB table locally |
| `npm run db:seed` | Seed test data (2 users, ratings, friends) |
| `npm run db:seed-large` | Seed larger dataset for load testing |
| `npm run test --workspace=backend` | Run all backend tests |
| `npm run test:watch --workspace=backend` | Watch mode |
| `npm run build --workspace=frontend` | Type-check + Vite build |
| `npm run lint --workspace=frontend` | ESLint |
| `bash scripts/build-lambdas.sh` | Bundle all Lambda handlers to dist/lambdas/*.zip |

## Environment Variables

Set in `.env` at project root (loaded by `dotenv/config` in `local-server.ts`):

| Variable | Local Value | Purpose |
|---|---|---|
| `DYNAMODB_ENDPOINT` | `http://localhost:8000` | DynamoDB Local endpoint |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO endpoint |
| `S3_BUCKET` | `coffee-app-photos` | Photo storage bucket |
| `S3_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `S3_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `S3_REGION` | `eu-west-1` | S3 region |
| `AWS_REGION` | `eu-west-1` | DynamoDB region |
| `OPENAI_API_KEY` | *(optional)* | For AI caffeine resolution |

## Adding a New Endpoint

1. **Handler:** Create `backend/src/handlers/<name>.ts` following existing patterns (Zod schema, response helpers).
2. **Tests:** Create `backend/src/handlers/<name>.test.ts` with mocked DynamoDB calls.
3. **Local server:** Import and register route in `backend/local-server.ts`.
4. **Terraform:** Add entry to `locals.handlers` map in `terraform/main.tf`.
5. **Build script:** Add handler name to `HANDLERS` array in `scripts/build-lambdas.sh`.
6. **Frontend:** Add method to `frontend/src/api/client.ts`.

## Seed Data

- **tomas** (userId: `11111111-...`) — 3 ratings at 2 places
- **coffee_lover** (userId: `22222222-...`) — 1 rating
- They are friends with each other

## Conventions

- **Pagination:** Cursor-based (base64url-encoded JSON). Default 10, max 50 items.
- **IDs:** UUIDs for users/ratings/comments. Place IDs: `place_<snake_case_name>`.
- **Timestamps:** ISO 8601 strings.
- **Error responses:** `{ error: string }` with appropriate HTTP status code.
- **TailwindCSS v4:** Uses `@import "tailwindcss"` — not the older `@tailwind` directives.
- **Leaflet:** CSS loaded from CDN in `index.html`, marker icons also from CDN.
