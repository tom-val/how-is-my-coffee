# Coffee API

One .NET 10 minimal API, compiled with Native AOT and deployed as a **single** Lambda
(`provided.al2023`, arm64, `bootstrap`) behind an API Gateway HTTP API. Locally the same binary runs
under Kestrel on <http://localhost:5090>.

The wire contract lives in [`../docs/api-contract.md`](../docs/api-contract.md) — that document wins
over this one.

## Layout

```
Coffee.slnx
src/Coffee.Api/
  Program.cs                  composition root: Lambda hosting, CORS, AWS clients, middleware, routes
  Features/<Feature>/         one Map<Feature>Endpoints extension + its DTO records per feature
  Shared/Auth/                JWT issuing + validation, PBKDF2 hashing, legacy scrypt verification
  Shared/Data/                DynamoDB wrapper, key/attribute constants, cursors, timestamps
  Shared/Caffeine/            static lookup table + the OpenAI fallback
  Shared/Storage/             presigned S3/MinIO uploads and public photo URLs
  Shared/Serialization/       the source-generated JSON context (see "Native AOT" below)
tools/Coffee.Seed/            creates the table + bucket and loads demo data
tests/Coffee.Api.Tests/       unit tests (hashing, JWT, caffeine table, cursors, health)
tests/Coffee.Api.IntegrationTests/  full HTTP flows against DynamoDB Local + MinIO
```

## Running it

From the repository root (`make help` lists everything):

```bash
make infra    # DynamoDB Local :8000 + MinIO :9000/:9001
make seed     # creates table CoffeeApp (with GSI1) and bucket coffee-app-photos, loads demo data
make api      # http://localhost:5090
make api-lan  # 0.0.0.0:5090 — use this when a phone on the same Wi-Fi is the client
make test     # unit + integration tests
```

Seeded logins (password `coffee123` for both):

| User | Stored hash | Why |
|---|---|---|
| `tomas` | PBKDF2 | the format new sign-ups get |
| `coffee_lover` | legacy scrypt | exercises the migration path — logging in upgrades it in place |

`make api-lan` also rewrites `Photos:ServiceUrl` and `Photos:PublicBaseUrl` from `localhost` to this
machine's current LAN IP, so presigned uploads and photo URLs work from a real device.

## Tests

`dotnet test Coffee.slnx` runs both projects. The integration suite needs DynamoDB Local; without it
every test reports as **skipped** with a message telling you to run `make infra`, rather than
failing. Each run creates and drops its own `CoffeeAppTest<guid>` table, so it never touches seeded
data.

## Native AOT

`dotnet publish -c Release -r linux-arm64` produces the native `bootstrap` that ships to Lambda.
Check it locally before pushing:

```bash
make aot-check   # dotnet publish -c Release -r osx-arm64
```

Two rules keep that publish working:

1. **No reflection-based `System.Text.Json`.** Every serialized type is registered in
   `Shared/Serialization/ApiJsonSerializerContext.cs`, and endpoints return
   `Results.Json(dto, ApiJsonSerializerContext.Default.Dto)` — never an anonymous object. Adding a
   DTO means adding a `[JsonSerializable]`. `SYSLIB1031` is an error so mistakes fail the build.
2. **No reflection-based DynamoDB mapping.** Items are `Dictionary<string, AttributeValue>` built
   and read by hand (`Shared/Data`), not the document or object-persistence models.

The publish emits `IL2026`/`IL3050` warnings from `AWSSDK.*` and `Amazon.Lambda.*` — those
assemblies are rooted via `TrimmerRootAssembly` and the paths they warn about are never taken. They
are deliberately *not* errors; a warning that points at a file under `Features/` or `Shared/` is
ours and must be fixed.

## Configuration

Read through `IConfiguration`, so Lambda environment variables use `__` for the `:`
(`Dynamo:TableName` → `Dynamo__TableName`).

| Key | Default | Purpose |
|---|---|---|
| `Dynamo:TableName` | `CoffeeApp` | Single table name |
| `Dynamo:ServiceUrl` | *(unset)* | DynamoDB Local endpoint — **dev/tests only**; unset means the Lambda role + region |
| `Auth:JwtSecret` | *(none — startup fails)* | HS256 signing key for the 30-day tokens |
| `Photos:Bucket` | *(none — fails on first use)* | Photo bucket |
| `Photos:PublicBaseUrl` | *(empty)* | Prefix for `photoUrl` (CloudFront origin in prod, MinIO bucket URL in dev) |
| `Photos:ServiceUrl` | *(unset)* | MinIO endpoint — **dev only**; also switches presigned URLs to `http` |
| `Photos:AccessKey` / `Photos:SecretKey` | `minioadmin` | MinIO credentials — **dev only** |
| `Photos:Region` | `eu-west-1` | Signing region for the S3 client |
| `OpenAi:ApiKey` | *(unset)* | Caffeine fallback; unset logs a warning and unknown drinks resolve to `{0, "error"}` |
| `Cors:AllowedOrigins` | `[]` | Allowed origins in production; Development allows any origin |

`appsettings.Development.json` holds the local values, including a throwaway JWT secret.

## DynamoDB

Single table, unchanged from the Node backend so production rows keep working — keys and attribute
names are in `Shared/Data/Keys.cs`. Two additions:

- `TAGGED#<createdAt>#<ratingId>` rows on a companion's partition, so "Coffees with me" and the feed
  are a query rather than a scan.
- `GSI1`, which carries two partitions:
  - `GSI1PK="USERNAME"`, `GSI1SK=<username>` on the `USERNAME#` rows — the username prefix search.
  - `GSI1PK="PLACE"`, `GSI1SK=<placeId>` on the `PLACE#<id>/META` rows — the map / discovery query
    behind `GET /v1/places`, which reads that one small partition and filters the viewport in memory
    instead of scanning the table.

Rows written by the old backend have no `GSI1PK`/`GSI1SK`, and both partitions backfill themselves
rather than needing a migration job: login backfills the `USERNAME#` row (`if_not_exists`, so it is
idempotent), and `RatingStore.RecomputePlaceStatsAsync` rewrites the place keys on every create,
edit and delete — so a café joins the map the next time anyone rates there.
