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
  Shared/Push/                Expo push sender + the notifier that decides who gets what
  Shared/Moderation/          content filter (word list) + the per-request block list
  Shared/Data/                DynamoDB wrapper, key/attribute constants, cursors, timestamps
  Shared/Caffeine/            static lookup table + the OpenAI fallback
  Shared/Storage/             presigned S3/MinIO uploads and public photo URLs
  Shared/Serialization/       the source-generated JSON context (see "Native AOT" below)
tools/Coffee.Seed/            creates the table + bucket and loads demo data
tests/Coffee.Api.Tests/       unit tests (hashing, JWT, caffeine table, cursors, health, Expo push, deleted-user tokens, content filter)
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
| `OpenAi:Model` | `gpt-5.6-luna` | Model for the caffeine fallback (Responses API) |
| `OpenAi:ReasoningEffort` | `none` | `reasoning.effort` sent with it; switch to `low` for a model that rejects `none` |
| `Google:PlacesApiKey` | *(unset)* | Place search proxy; unset logs a warning and `/v1/places/suggest` answers `503 place_search_unavailable` |
| `Push:Enabled` | `true` | Set to `false` to make the notifier a no-op — no Expo call, no extra DynamoDB reads. The test hosts use this |
| `Push:AccessToken` | *(unset)* | Expo access token; sent as `Authorization: Bearer …` only when set (needed only for Expo accounts with enhanced security) |
| `Moderation:NotifyUsernames` | *(empty)* | Comma-separated usernames that get a push for every new report; empty = reports are only logged. Prod: Terraform `moderation_notify_usernames` (default `tomas`); Development: `tomas` |
| `Cors:AllowedOrigins` | `[]` | Allowed origins in production; Development allows any origin |

`appsettings.Development.json` holds the local values, including a throwaway JWT secret.
Secrets that must not be committed go in `appsettings.Local.json` next to it — gitignored, optional,
loaded last (so it wins over the other files) and never copied into a publish, so it cannot reach a
Lambda zip:

```json
{ "Google": { "PlacesApiKey": "…" } }
```

## Google Places

`GET /v1/places/suggest` and `GET /v1/places/suggest/{googlePlaceId}` proxy Places API (New)
autocomplete and details, so the key stays on this side of the wire — it is never shipped to a phone
or a browser, and never logged. `Shared/Places/GooglePlacesClient.cs` owns the two calls: they share
one `sessionToken` (the app's UUID per search box), bias to a 25 km circle when the caller sends
`lat`/`lng`, restrict the types to cafés and their neighbours, and ask details for the Essentials
field mask only, so a whole type-ahead is billed as one session. The timeout is 5 s.

The key comes from `Google:PlacesApiKey` (Lambda env var `Google__PlacesApiKey`; locally
`appsettings.Local.json`). Behaviour without it is deliberate and part of the contract: both
endpoints answer `503 { "error": "place_search_unavailable" }` and the app falls back to Nominatim.
An upstream failure, timeout or unparseable answer is a different thing and answers
`502 { "error": "place_search_failed" }`. The test hosts blank the key, so no test ever calls Google.

## Push notifications

Expo push, sent by this API itself — there is no queue and no second Lambda. Five types, all on by
default and each switchable in Settings:

| type | goes to | raised by |
|---|---|---|
| `tagged` | each registered companion | `POST /v1/ratings`, and `PUT /v1/ratings/{id}` for companions the edit **added** |
| `like` | the rating's author | `POST /v1/ratings/{id}/like`, on the like only |
| `comment` | the rating's author | `POST /v1/ratings/{id}/comments` |
| `follow` | the user being followed | `POST /v1/friends`, only when the friend is new |
| `friendRating` | everyone following the author | `POST /v1/ratings` |

Nobody is ever notified about their own action: the actor is removed from the recipients, which is
what makes "liking your own rating" and "commenting on your own rating" silent. Unliking, deleting a
rating and unfollowing notify nobody. Tokens are per user, not per rating, so a deleted rating
leaves nothing dangling.

`Shared/Push` holds the two pieces:

- **`ExpoPushSender`** posts to `https://exp.host/--/api/v2/push/send` in chunks of 100 (Expo's
  limit), reads the tickets back positionally and returns the tokens whose ticket says
  `DeviceNotRegistered` so the notifier can delete them. Other ticket errors (bad APNs/FCM
  credentials, rate limits) are logged — they are invisible otherwise. Nothing here throws.
- **`Notifier`** resolves each recipient's preferences and devices, writes the English copy, hands
  the batch to the sender and prunes dead tokens. Everything runs inside a **3 s**
  `CancellationTokenSource` with a catch-all around it.

Why awaited rather than fired and forgotten: Lambda freezes the execution environment the moment the
response is written, so a background send would simply never run. Each endpoint therefore `await`s
its notification immediately before returning, and the 3 s budget plus the catch-all are what keep a
slow or broken Expo from changing a single status code.

Storage is two rows:

- `PK=USER#<userId> SK=PUSH#<token>` — one per device (`token`, `platform`, `createdAt`,
  `lastSeenAt`). The token is the sort key, so `PUT /v1/push/tokens` is an upsert and signing out
  deletes exactly one row. `createdAt` survives a re-register via `if_not_exists`.
- `notificationPrefs`, a map attribute on the `USER#<id>/PROFILE` row. Defaults are expressed by
  *absence*: a missing attribute, a missing key or a non-boolean value all read as `true`, so every
  account written by the old stack works untouched. `PUT /v1/notification-prefs` merges the keys the
  body carried into what is stored and writes the whole map back.

Tests: `ExpoPushSenderTests` drives the sender against a fake transport (chunking, the optional auth
header, ticket handling, and every failure mode collapsing to "nothing sent"). `PushTests` runs the
real endpoints against DynamoDB Local on a second host with `Push:Enabled=true` and Expo replaced by
a capturing `IPushSender`; the rest of the integration suite leaves `Push:Enabled=false`, so no other
test builds a message.

## Account deletion

`DELETE /v1/me` with `{ "password": "…" }` (the App Store / Google Play in-app deletion requirement).
The password is re-checked (legacy scrypt hashes verify too), so a stolen token alone cannot wipe an
account. `Features/Account/AccountDeleter.cs` then removes, in this order:

1. every rating the user wrote — photo object first (only keys under `uploads/<userId>/`, since
   `photoKey` is client-supplied), then `RatingStore.DeleteRatingAsync`, the same teardown
   `DELETE /v1/ratings/{id}` uses; places run in parallel, ratings of one place in sequence so the
   stats recompute cannot race;
2. their likes and comments on other people's ratings — a filtered table **Scan** (nothing indexes
   those rows by author; O(table), acceptable at this scale). Row delete + the three counter
   decrements are one transaction, guarded so a counter never drops below 0;
3. their entry in other people's `companions` (all three copies), then their `TAGGED#` rows;
4. `FRIEND#`/`FOLLOWER#` rows and the mirror rows on the other users' partitions;
5. `BLOCK#`/`BLOCKEDBY#` rows and their mirrors on the other users' partitions, then the reports the
   user filed (`REPORTED#` pointers + a GSI1 query of the report queue filtered on
   `reporterUserId`) — reports filed *against* the user stay as moderation history;
6. `PUSH#` tokens, then a sweep of anything else left on `USER#<id>`;
7. the `USERNAME#` lookup (conditional on it still pointing at this user) and the `PROFILE` row, last.

Every step re-reads what is left, so a call that dies half-way can simply be repeated with the same
token and password — the profile is still there until the very end. After that, old tokens are
refused centrally: `AuthMiddleware` checks that the token's user still has a profile (one strongly
consistent key-only `GetItem` per authenticated request, `Shared/Auth/AccountLookup.cs`) and treats
a deleted user as anonymous, so every protected endpoint answers `401 unauthorized`. A large account
can outrun the 30 s Lambda / API Gateway limit; the client's retry finishes the job.

## DynamoDB

Single table, unchanged from the Node backend so production rows keep working — keys and attribute
names are in `Shared/Data/Keys.cs`. Two additions:

- `TAGGED#<createdAt>#<ratingId>` rows on a companion's partition, so "Coffees with me" and the feed
  are a query rather than a scan.
- `PUSH#<expoPushToken>` rows on a user's partition, one per registered device (see "Push
  notifications" above).
- `BLOCK#<blockedId>` / `BLOCKEDBY#<blockerId>` rows on a user's partition, `REPORTED#<type>#<id>`
  pointers on the reporter's partition and `REPORT#<id>/META` items (see "Moderation" below).
- `GSI1`, which carries two partitions:
  - `GSI1PK="USERNAME"`, `GSI1SK=<username>` on the `USERNAME#` rows — the username prefix search.
  - `GSI1PK="PLACE"`, `GSI1SK=<placeId>` on the `PLACE#<id>/META` rows — the map / discovery query
    behind `GET /v1/places`, which reads that one small partition and filters the viewport in memory
    instead of scanning the table.
  - `GSI1PK="REPORT"`, `GSI1SK=<createdAt>` on the `REPORT#<id>/META` rows — the moderation queue.

Rows written by the old backend have no `GSI1PK`/`GSI1SK`, and both partitions backfill themselves
rather than needing a migration job: login backfills the `USERNAME#` row (`if_not_exists`, so it is
idempotent), and `RatingStore.RecomputePlaceStatsAsync` rewrites the place keys on every create,
edit and delete — so a café joins the map the next time anyone rates there.

## Setting a password by hand

Accounts have no e-mail, so there is no self-service reset. `tools/Coffee.Admin` writes a new hash
with the API's own `PasswordHasher`:

```bash
make set-password USER=tomas PASS='new-password'            # production, via your AWS credentials
make set-password USER=tomas PASS=coffee123 ENDPOINT=http://localhost:8000   # DynamoDB Local
dotnet run --project backend/tools/Coffee.Admin -- hash-password 'new-password'   # just the hash + aws CLI commands (CloudShell)
```

Existing sessions keep their 30-day tokens; only new sign-ins need the new password.

## Backfilling the GSI1 index after the rework

Rows written by the old Node backend have no `GSI1PK`/`GSI1SK`, so Discover and username search do
not see them until a place is rated again or a user logs in. One command fixes everything at once
(idempotent):

```bash
dotnet run --project backend/tools/Coffee.Admin -- backfill-indexes               # production, your AWS creds
dotnet run --project backend/tools/Coffee.Admin -- backfill-indexes --endpoint http://localhost:8000
```

Or run the **Admin (manual)** GitHub workflow, which does the same with the deploy role.

## Deleting an account for someone who cannot sign in

The Support and delete-account pages promise deletion by e-mail. After verifying the request, run
the **Admin (manual)** workflow with `delete-account` and the username, or locally with AWS
credentials:

```bash
dotnet run --project backend/tools/Coffee.Admin -- delete-account <username> --bucket coffee-app-photos-<account>
```

It runs the same `AccountDeleter` as `DELETE /v1/me` (ratings, photos, reactions, companion tags,
follows, push tokens, profile and username), without the password check.

## Moderation

What App Store guideline 1.2 and Google Play's UGC policy ask of an app with user content: a way to
report it, a way to block people, a filter, and someone acting on reports. The contract section
"Safety: reports, blocks, content filter" is the reference; this is how the backend does it.

**Content filter** — `Shared/Moderation/ContentFilter.cs`. A short static list of English and
Lithuanian slurs and explicit sexual / abusive terms (plus a few phrases such as "fuck you", "eik
nachui"), matched as whole words after lower-casing and folding diacritics, so "KURVĄ" hits while
"Scunthorpe", "cocktail" or "pizza" do not. Applied to sign-up (username, display name), ratings
(drink name, notes, guest companion names — create and edit) and comments; a hit is
`400 objectionable_content`. Deliberately narrow: plain profanity passes, reports catch the rest.

**Blocks** — `Features/Blocks`. `POST /v1/blocks` writes `USER#<me>/BLOCK#<them>` and the mirror
`USER#<them>/BLOCKEDBY#<me>` and deletes the follows between the two in both directions, all in one
transaction. `Shared/Moderation/BlockList` loads everyone hidden from the caller with **one** query
(`begins_with(SK, "BLOCK")` covers both row types) and only on the paths that need it:

- reads — feed, place ratings, rating detail (the rating itself 404s; likes and comments by the other
  side are hidden and the counters adjusted to match), "coffees with me", user search (also the
  companion picker), Discover friend counts, and a signed-in caller's view of the other user's profile
  and lists (`404 user_not_found`). Anonymous reads of `/v1/users/{username}` and its ratings are
  untouched (no query at all);
- writes — follow, like (taking a like back stays allowed), comment, and tagging as a companion on
  create/edit answer `403 blocked`. Companions already on a rating before the block do not stop the
  author from editing it; the block list is not even read when a rating has no registered companions.

**Reports** — `Features/Reports`. `POST /v1/reports` stores `REPORT#<id>/META` (`status: "open"`, an
excerpt of at most 200 characters: the comment text, "drink: notes" for a rating, the display name
for a user) on GSI1 under `"REPORT"` by `createdAt`, plus a pointer `USER#<reporter>/REPORTED#<type>#<id>`
→ reportId. The pointer makes a repeat report of an *open* one idempotent (`200` with the same id);
after a moderator resolves it, reporting again opens a new report. Every new report is logged and
pushed to each account in `Moderation:NotifyUsernames` ("New report: rating" / "spam · @user:
excerpt", tap → the rating or the profile). That push ignores notification preferences, uses the same
3 s budget as the others and only ever logs a failure.

**Acting on reports** — `tools/Coffee.Admin`, built on `Features/Reports/ModerationService.cs`, which
reuses the API's own teardown code. Every command is idempotent.

```bash
A="dotnet run --project backend/tools/Coffee.Admin --"
$A list-reports [--status open|all] [--limit N]   # newest first (default open, 50); prints the follow-up commands
$A remove-rating <ratingId> --bucket coffee-app-photos-<account>   # RatingStore.DeleteRatingAsync + the photo
$A remove-comment <ratingId> <commentId>          # RatingStore.RemoveReactionAsync: row + commentCount ×3
$A resolve-report <reportId>                      # status → resolved (resolvedAt kept on a repeat)
$A delete-account <username> --bucket coffee-app-photos-<account>  # the whole account, like DELETE /v1/me
```

Add `--endpoint http://localhost:8000` (and `Photos__ServiceUrl=http://localhost:9000` for
`remove-rating`) to run them against the local stack. The **Admin (manual)** GitHub workflow runs the
same commands against production with the deploy role.
