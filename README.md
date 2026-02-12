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

Infrastructure is managed with **Terraform** and deployed via **GitHub Actions**. No local Terraform installation is needed.

### Architecture

```
                   CloudFront (CDN)
                   /              \
          S3 Bucket (SPA)    API Gateway HTTP API
                               |
                          Lambda Functions (12 handlers)
                               |
                    DynamoDB          S3 (photos)
```

### Bootstrap (One-Time Setup)

Three steps are required before the first deployment. Everything else is managed by Terraform in the CD pipeline.

**1. Create Terraform state backend**

```bash
aws s3api create-bucket --bucket coffee-app-terraform-state --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1
aws s3api put-bucket-versioning --bucket coffee-app-terraform-state \
  --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name coffee-app-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region eu-west-1
```

**2. Create IAM role for GitHub Actions**

In the AWS Console: IAM > Roles > Create role > Web identity

| Field | Value |
|---|---|
| Identity provider | `token.actions.githubusercontent.com` (select "Create new" if not listed) |
| Audience | `sts.amazonaws.com` |
| GitHub organization | `tom-val` |
| GitHub repository | `how-is-my-coffee` |
| GitHub branch | `*` (allows both PRs and main) |

On the next screen, attach the **`AdministratorAccess`** policy. Name the role **`coffee-app-github-actions`** and create it.

Note the role ARN (e.g. `arn:aws:iam::123456789012:role/coffee-app-github-actions`).

**3. Configure GitHub repository**

In the repo settings (Settings > Secrets and variables > Actions):

| Type | Name | Value |
|---|---|---|
| Secret | `AWS_ROLE_ARN` | Role ARN from step 2 |
| Variable | `AWS_REGION` | `eu-west-1` |
| Variable | `AWS_ACCOUNT_ID` | Your AWS account ID |

After this, push the code to `main` and the CD workflow will create all AWS resources automatically.

### CI/CD Pipelines

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | Pull request to `main` | Lint, type-check, build frontend + Lambda handlers, `terraform plan` |
| **CD** (`.github/workflows/cd.yml`) | Push to `main` | Build everything, `terraform apply`, deploy frontend to S3, invalidate CloudFront |

### Terraform-Managed Resources

All resources are defined in the `terraform/` directory:

- **DynamoDB** table (`CoffeeApp`)
- **S3** buckets (photos with CORS + frontend with OAC)
- **Lambda** functions (12 handlers, Node.js 20, ESM)
- **API Gateway** HTTP API with path-based routing
- **CloudFront** CDN (serves frontend + proxies `/api/*` to API Gateway)
- **IAM** roles and policies for Lambda execution

### Lambda Build

The `scripts/build-lambdas.sh` script bundles each handler with esbuild:

```bash
bash scripts/build-lambdas.sh
```

This produces `dist/lambdas/<handler>.zip` files consumed by Terraform.

## Environment Variables

### Local Development (`.env`)

```env
DYNAMODB_ENDPOINT=http://localhost:8000
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=coffee-app-photos
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=eu-west-1
AWS_REGION=eu-west-1
```

### Production

Lambda environment variables are set automatically by Terraform (`S3_BUCKET`, `S3_REGION`). `DYNAMODB_ENDPOINT` and `S3_ENDPOINT` are not set in production -- the AWS SDK auto-discovers endpoints.

## Project Structure

```
coffee-app/
├── package.json              # Monorepo root (npm workspaces)
├── docker-compose.yml        # DynamoDB Local + MinIO
├── .env                      # Environment variables (local)
│
├── .github/workflows/        # GitHub Actions CI/CD
│   ├── ci.yml                # PR checks: lint, type-check, build, terraform plan
│   └── cd.yml                # Deploy: build, terraform apply, S3 sync, CloudFront invalidation
│
├── terraform/                # Infrastructure as code
│   ├── main.tf               # Provider, backend, handler map
│   ├── dynamodb.tf           # DynamoDB table
│   ├── s3.tf                 # S3 buckets (photos + frontend)
│   ├── lambda.tf             # Lambda functions + IAM
│   ├── api-gateway.tf        # HTTP API + routes
│   ├── cloudfront.tf         # CDN distribution
│   ├── variables.tf          # Input variables
│   └── outputs.tf            # Deployment outputs
│
├── scripts/
│   └── build-lambdas.sh      # Bundle Lambda handlers with esbuild
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
│   │   ├── handlers/         # Lambda function handlers (12 handlers)
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
| Infrastructure | Terraform (DynamoDB, S3, Lambda, API Gateway, CloudFront) |
| CI/CD | GitHub Actions (OIDC auth to AWS) |
