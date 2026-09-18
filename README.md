# Kavutė — How is my coffee?

Rate the drinks you have at cafés, keep an eye on your caffeine, follow friends, and tag the people
you had the coffee with. One Expo client (iOS / Android / Web) and one .NET 10 Native AOT Lambda over
DynamoDB.

```
app/        Expo client (expo-router, TypeScript, TanStack Query) — iOS / Android / Web
backend/    .NET 10 minimal API → single Lambda (provided.al2023, arm64) + tests + seed tool
infra/      Terraform (modules + prod environment) + bootstrap.sh
docs/       API contract (the source of truth for the wire format) and the rework plan
.github/    pr-checks (build/test/lint/validate) and deploy (Terraform, Lambda, web to S3 + CloudFront)
```

## Prerequisites

- Docker (DynamoDB Local + MinIO)
- .NET 10 SDK
- Node 20+
- Terraform 1.6+ (only to work on `infra/`)
- Xcode / Android Studio only for native device builds; web and the iOS Simulator need nothing extra

## Local development

```bash
make infra     # DynamoDB Local :8000 + MinIO :9000 (console :9001)
make seed      # creates table CoffeeApp + bucket coffee-app-photos, loads demo data
make api       # API on http://localhost:5090
make web       # Expo web on http://localhost:8081
```

`make help` lists every target. Demo logins, both with password `coffee123`:

| Username | Note |
|---|---|
| `tomas` | follows `coffee_lover`; has ratings with tagged companions |
| `coffee_lover` | stored with the old scrypt hash — logging in migrates it to PBKDF2 |

### On a phone

```bash
make api-lan               # binds 0.0.0.0:5090 and rewrites photo URLs to this machine's LAN IP
cd app && npm run ios      # local debug build on the booted simulator (or --device for a phone)
cd app && npm run android  # same for the running emulator / a connected phone
```

Like the kindergarten app this is a native-build workflow: `expo run:*` compiles a debug app once,
then JS changes hot-reload from Metro. Expo Go is not supported (push, Google Maps and the keyboard
library need native modules it lacks). Devices get EAS builds (`eas-build` workflow) and JS-only
changes via EAS Update. In development the app derives the API host from the Metro server it
connected to, so a device on the same Wi-Fi needs no `.env` changes. See `app/README.md`.

### Tests

```bash
make test          # backend unit + integration tests (integration skips without `make infra`)
cd app && npm run typecheck && npm run lint
make aot-check     # Native AOT publish for this Mac — catches trimming/AOT breakage before CI does
```

## Architecture

```
            CloudFront
      /          |           \
  S3 (web)   API Gateway    S3 (photos, /uploads/*)
   Expo        HTTP API
   export        |
            Lambda coffee-api  (.NET 10 Native AOT, one function, validates its own JWTs)
                 |
            DynamoDB CoffeeApp (single table + GSI1)     OpenAI (caffeine fallback, optional)
```

- **Auth:** username + password. The API mints 30-day HS256 JWTs; clients send `Authorization: Bearer`.
- **Data:** one DynamoDB table, unchanged keys from the previous stack, so existing users, ratings and
  photos carried over. New: `TAGGED#` rows for companions and `GSI1` for username search.
- **Photos:** presigned S3 PUT from the client; served through CloudFront under `/uploads/*`.
- **Contract:** [`docs/api-contract.md`](docs/api-contract.md). Both the app and the API are written
  against it.

## Deployment

Everything deploys from GitHub Actions on push to `main` (`deploy-prod.yml`): Terraform apply,
Native AOT build inside Amazon Linux 2023 on an arm64 runner, `update-function-code`, Expo web
export to S3 and a CloudFront invalidation. Native binaries are built on demand with the manual
`eas-build` workflow once EAS is initialised.

One-time setup and the GitHub secrets table are in [`infra/README.md`](infra/README.md).

## Repository history

This is the second generation of the app. The first was a Vite SPA plus 16 Node Lambdas; the
rework to one .NET Native AOT Lambda and an Expo client is described in
[`docs/rework-plan.md`](docs/rework-plan.md).
