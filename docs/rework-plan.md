# Rework plan: one .NET Native AOT Lambda + Expo (iOS / Android / Web)

Modelled on ../kindergarten (same author). Target layout:

```
app/        Expo client (expo-router, TypeScript, TanStack Query) — iOS / Android / Web
backend/    .NET 10 minimal API, Native AOT, single Lambda (provided.al2023, arm64) + xUnit tests + seed tool
infra/      Terraform: modules (lambda, api-gateway, dynamodb, s3-photos, cloudfront) + environments/prod
docs/       this plan + API contract
.github/    pr-checks.yml (build/test/lint/terraform validate) + deploy-prod.yml (terraform apply, ship Lambda, web to S3+CloudFront)
Makefile    local dev targets (infra up/down, api, web, seed, test)
docker-compose.yml  DynamoDB Local (:8000) + MinIO (:9000/:9001)
```

Decisions (made so work can proceed without blocking):
1. Database stays DynamoDB single-table `CoffeeApp` with the existing key design (prod data preserved). Low-level `AWSSDK.DynamoDBv2` client (AttributeValue maps), no reflection-based object persistence (AOT).
2. Auth: username/password stays; the API now issues an HS256 JWT (secret from Terraform `random_password` → Lambda env). Old scrypt hashes verify and are migrated to PBKDF2 on login. No separate authorizer Lambda — the single API Lambda validates tokens itself.
3. API paths move from `/api/...` to `/v1/...` (see docs/api-contract.md). Old Lambdas + old web SPA are removed.
4. Old `frontend/`, `backend/` (TypeScript), `terraform/`, `scripts/` are deleted; root `package.json` workspace is gone (app has its own package.json; backend is dotnet).
5. New feature: companions on a rating (registered users or guest names), `TAGGED#` rows, "Coffees with me" section, feed includes tagged ratings.
6. Maps: no in-app map in v1 of the rewrite (Leaflet does not run on native). Places are searched via Nominatim + device location (expo-location); "Open in Maps" via Linking.
