# Kavutė (how-is-my-coffee)

Coffee-rating app: rate drinks at cafés, track caffeine, follow friends, tag the people you drank
with ("companions"). One Expo client (iOS / Android / Web) + one .NET 10 Native AOT Lambda over
DynamoDB. Layout and conventions follow ../kindergarten (same author).

## Quick start

```bash
make infra   # DynamoDB Local :8000 + MinIO :9000/:9001
make seed    # table CoffeeApp (+GSI1), bucket coffee-app-photos, demo users tomas / coffee_lover (coffee123)
make api     # http://localhost:5090   (make api-lan → 0.0.0.0 for a phone on the LAN)
make web     # Expo web :8081          (cd app && npm run ios | android = local native debug build; no Expo Go)
make test    # dotnet unit + integration tests (integration auto-skips without `make infra`)
```

## Layout

```
app/                     Expo SDK app (expo-router). src/app = routes, src/features = screens,
                         src/components = shared UI, src/lib/api.ts = the only place that calls the API,
                         src/theme = light/dark tokens (palette.js), src/i18n = en + lt
backend/Coffee.slnx
backend/src/Coffee.Api/  Program.cs; Features/<Feature>/<Feature>Endpoints.cs (+ DTO records);
                         Shared/{Auth,Data,Caffeine,Storage,Serialization,Middleware}
backend/tests/           Coffee.Api.Tests (unit), Coffee.Api.IntegrationTests (DynamoDB Local + MinIO)
backend/tools/Coffee.Seed/  creates table/bucket + demo data, idempotent
infra/modules/{dynamodb,lambda,api-gateway,s3-web,s3-photos,cloudfront}, infra/environments/prod
docs/api-contract.md     THE wire contract. Change it first, then both sides.
.github/workflows/       pr-checks.yml, deploy.yml (reusable), deploy-prod.yml, eas-build.yml (manual)
```

## Backend rules (Native AOT — these break the publish, not the build)

- Every type that crosses the wire is registered in `Shared/Serialization/ApiJsonSerializerContext.cs`.
  Return `Results.Json(dto, ApiJsonSerializerContext.Default.Dto, statusCode)` or the `ApiResults` helpers.
  Never anonymous objects; `SYSLIB1031` is an error.
- DynamoDB via the low-level client only: `Dictionary<string, AttributeValue>` built with the `Av`/`Attr`/`Keys`
  helpers in `Shared/Data`. No document model, no object-persistence model, no reflection.
- Endpoints resolve identity with `auth.TryRequireUser(out userId, out failure)`; public routes are
  listed in the contract. The API mints and validates its own HS256 JWTs (`Shared/Auth/JwtIssuer`).
- Keep DynamoDB attribute names as they are — production rows from the old Node stack must keep working.
- Before pushing backend changes: `make test` and `make aot-check`.

## App rules

- All HTTP goes through `app/src/lib/api.ts`; types in `app/src/types/index.ts` mirror the contract DTOs.
- Server state = TanStack Query (infinite queries keyed by cursor); like toggles update every cache
  that holds the rating. Token lives in SecureStore (native) / localStorage (web) via `tokenStorage`.
- Colours only through `@/theme` tokens (light + dark). Strings through i18n (`en` is the source, keep `lt` in step).
- Web is a centered ≤500 px column; routes are deep-linkable (`/u/[username]`, `/rating/[id]`, `/place/[placeId]`).
- Native modules (push, maps, keyboard-controller) mean Expo Go is NOT supported: test with `expo run:ios|android` or an EAS build.
- Before pushing app changes: `cd app && npm run typecheck && npm run lint && npm run export:web`.

## Adding an endpoint

1. Describe it in `docs/api-contract.md`.
2. Backend: add DTO records + `[JsonSerializable]` entries, implement in the feature's `Map…Endpoints`, add tests.
3. App: add the method to `src/lib/api.ts` and the type to `src/types`, then the screen.
4. No Terraform change is needed — the `$default` route sends everything to the one Lambda.

## DynamoDB single table `CoffeeApp` (PK + SK, PAY_PER_REQUEST, GSI1 on GSI1PK/GSI1SK)

| Entity | PK | SK |
|---|---|---|
| User profile | `USER#<userId>` | `PROFILE` |
| User rating | `USER#<userId>` | `RATING#<createdAt>#<ratingId>` |
| User place | `USER#<userId>` | `PLACE#<placeId>` |
| Friend / Follower | `USER#<userId>` | `FRIEND#<id>` / `FOLLOWER#<id>` |
| Tagged as companion | `USER#<userId>` | `TAGGED#<createdAt>#<ratingId>` |
| Rating detail / like / comment | `RATING#<ratingId>` | `META` / `LIKE#<userId>` / `COMMENT#<createdAt>#<commentId>` |
| Place detail / place rating | `PLACE#<placeId>` | `META` / `RATING#<createdAt>#<ratingId>` |
| Username lookup | `USERNAME#<username>` | `USERNAME` (+ `GSI1PK="USERNAME"`, `GSI1SK=<username>`) |

Ratings are denormalised to USER#, PLACE# and RATING# via TransactWriteItems. Place stats use each
user's latest rating. Companions are a list of `{ userId?, username?, displayName }` on every copy.

## Infra / deploy

- Lambda code is shipped by CI (`update-function-code`); Terraform holds a placeholder zip with
  `ignore_changes`, so `terraform apply` never reverts the running code.
- AOT must be compiled inside `amazonlinux:2023` on arm64 (glibc); see `deploy.yml`.
- `environments/prod/main.tf` ends with `moved` blocks that preserve the table, buckets, CloudFront
  and the HTTP API from the pre-rework state. `prevent_destroy` guards the table and photos bucket.
- Config reaches the Lambda as env vars with `__` (`Dynamo__TableName`, `Auth__JwtSecret`,
  `Photos__Bucket`, `Photos__PublicBaseUrl`, `OpenAi__ApiKey`, `Cors__AllowedOrigins__0`).
- GitHub: secret `AWS_ROLE_ARN` (required), `OPENAI_API_KEY`, `EXPO_TOKEN` (optional); environment `Prod` (the pre-existing one).

## Conventions

- Pagination: `?limit=&cursor=` (opaque base64url), default 10, max 50, response `nextCursor: string | null`.
- Errors: `{ "error": "<snake_case_code or message>" }`; the app maps codes to i18n strings.
- Timestamps ISO 8601 UTC; IDs are UUIDs; place IDs `place_<snake_case_name>`.
- Name: the product is **Kavutė** (ASCII `kavute` in identifiers, slug, scheme, bundle id `com.tomval.kavute`).
  Repo, Terraform project (`coffee-app`) and AWS resource names are unchanged on purpose.
