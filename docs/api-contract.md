# Coffee API contract (v1)

Single HTTP API served by ONE .NET 10 Native AOT Lambda (`coffee-api`) behind API Gateway HTTP API.
Locally the same ASP.NET app runs with `dotnet run` on http://localhost:5080.
All paths below are relative to the API base URL (`EXPO_PUBLIC_API_URL`), e.g. `http://localhost:5080/v1/feed`.
In production the CloudFront distribution forwards `/v1/*` to API Gateway and `/uploads/*` to the photos bucket,
so the web app and native apps can use the CloudFront origin as the API base.

## Conventions

- JSON everywhere, camelCase property names. `Content-Type: application/json`.
- Timestamps: ISO 8601 UTC strings (`2025-01-02T10:20:30.000Z`).
- IDs: UUID strings for users/ratings/comments. Place IDs: `place_<snake_case_name>` (client-generated from the place name, as today).
- Errors: `{ "error": "<message or snake_case_code>" }` with a proper status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 500).
- Pagination: cursor-based. Query `?limit=10&cursor=<opaque>`; default 10, max 50. Responses carry `nextCursor: string | null`.
  Cursor is an opaque base64url string (the .NET side encodes whatever it needs, e.g. the DynamoDB LastEvaluatedKey or the last createdAt).
- Photos: `photoKey` is the S3 object key (`uploads/<userId>/<uuid>.<ext>`); `photoUrl` is an absolute URL the client can load
  (local: `http://<host>:9000/coffee-app-photos/<key>` (MinIO); prod: `https://<cloudfront>/<key>` via the `/uploads/*` behaviour).
  The API always returns `photoUrl` when `photoKey` is set. `Photos:PublicBaseUrl` config controls the prefix.

## Auth

- Sign-up / sign-in return a **JWT** (HS256, signed with `Auth:JwtSecret`, 30-day expiry, claims `sub` = userId, `username`).
  Hand-rolled HMAC validation in middleware (no reflection-based JWT libs — Native AOT). The API is the only thing that mints or validates tokens.
- Clients send `Authorization: Bearer <token>`. Middleware resolves `AuthContext { UserId, Username }`.
- Public (no token): `GET /health`, `POST /v1/auth/register`, `POST /v1/auth/login`, `GET /v1/users/{username}` (public profile), `GET /v1/users/{username}/ratings` (public list).
  Everything else → 401 when the token is missing/invalid.
- Password hashing: PBKDF2-SHA256 (`pbkdf2$<iterations>$<saltB64>$<hashB64>`). Legacy hashes from the old Node backend are scrypt
  (`<saltHex>:<hashHex>`, N=16384 r=8 p=1, keyLen 64) and MUST still verify (pure-managed scrypt), then be transparently re-hashed to PBKDF2 on next login.

## Endpoints

### Health
- `GET /health` → `200 { "status": "ok" }`

### Auth / users
- `POST /v1/auth/register` body `{ username, displayName, password }`
  - username: 3–30 chars, `^[a-zA-Z0-9_]+$`, stored lowercase; displayName 1–50; password 6–100.
  - 201 `{ token, user: UserDto }`; 409 `username_taken`.
- `POST /v1/auth/login` body `{ username, password }` → 200 `{ token, user: UserDto }`; 401 `invalid_credentials`.
- `GET /v1/me` → 200 `UserDto` (+ `totalCaffeineMg`).
- `GET /v1/users/{username}` → 200 `UserDto` (public; no passwordHash ever leaves the server). 404.
- `GET /v1/users/{username}/ratings?limit&cursor` → `RatingPage` (public; `likedRatingIds` is `[]` when unauthenticated).
- `GET /v1/users/{username}/places` → `{ places: UserPlaceDto[] }`
- `GET /v1/users/{username}/caffeine` → `{ todayMg, totalMg }` (todayMg = sum of caffeineMg for ratings created today, UTC).
- `GET /v1/users/{username}/tagged?limit&cursor` → `RatingPage` — ratings where this user was tagged as a companion (see Companions).

`UserDto = { userId, username, displayName, createdAt, totalCaffeineMg?: number }`

### Friends (following model, unchanged semantics)
- `GET /v1/friends` → `{ friends: FriendDto[] }` (people I follow)
- `GET /v1/followers` → `{ followers: FollowerDto[] }`
- `POST /v1/friends` body `{ friendUsername }` → 201 `FriendDto`; 404 `user_not_found`; 400 `cannot_add_self`; idempotent (adding twice is fine).
- `DELETE /v1/friends/{friendUserId}` → 200 `{ status: "deleted" }` (NEW: unfollow)
- `GET /v1/users/search?q=<prefix>` → `{ users: UserDto[] }` — up to 10 users whose username starts with `q` (lowercased, min 2 chars).
  Used by the companion picker and the add-friend screen. Implementation hint: query `USERNAME#` items is not prefix-queryable on PK; either
  add a GSI (`entityType = UsernameIndex`, SK = username) or scan-limited fallback. Prefer a GSI `GSI1` with `GSI1PK = "USERNAME"`, `GSI1SK = <username>`.

`FriendDto = { friendUserId, friendUsername, friendDisplayName, addedAt }`
`FollowerDto = { followerUserId, followerUsername, followerDisplayName, followedAt }`

### Ratings
`RatingDto = {
  ratingId, userId, username, displayName,
  placeId, placeName, address?, lat, lng,
  stars (1–5, step 0.5), drinkName, description?, photoKey?, photoUrl?,
  caffeineMg (int, default 0), likeCount, commentCount,
  companions: CompanionDto[],
  createdAt, updatedAt?
}`
`CompanionDto = { userId?: string, username?: string, displayName: string }` — a registered user (userId+username set) or a free-text guest (only displayName).
`RatingPage = { ratings: RatingDto[], likedRatingIds: string[], nextCursor: string | null }`

- `POST /v1/ratings` body `{ placeId, placeName, stars, drinkName, description?, photoKey?, lat, lng, address?, caffeineMg?, companions?: CompanionInput[] }`
  - `CompanionInput = { username?: string, displayName?: string }` — at least one set. Max 10 companions. A `username` must exist (404 `user_not_found`)
    and must not be the author (400 `cannot_tag_self`). Registered companions are stored with their `userId`, `username`, `displayName` snapshot.
  - 201 `RatingDto`.
- `GET /v1/ratings/{ratingId}` → `RatingDetail = { rating: RatingDto, likes: LikeDto[], comments: CommentDto[], isLikedByMe }`; 404.
- `PUT /v1/ratings/{ratingId}` body: any subset of `{ stars, drinkName, description|null, photoKey|null, caffeineMg, placeName, lat, lng, address|null, companions }` → 200 `RatingDto`; 403 if not owner.
  When `companions` is provided it REPLACES the list.
- `DELETE /v1/ratings/{ratingId}` → 200 `{ status: "deleted" }` (NEW; owner only; removes all denormalised copies, tags, likes, comments; recomputes place stats and totalCaffeineMg).
- `POST /v1/ratings/{ratingId}/like` → 200 `{ liked: boolean, likeCount: number }` (toggle)
- `POST /v1/ratings/{ratingId}/comments` body `{ text }` (1–500) → 201 `CommentDto`
- `GET /v1/feed?limit&cursor` → `RatingPage` — ratings by me + people I follow + ratings I was tagged in, newest first.

`LikeDto = { userId, username, displayName }`
`CommentDto = { commentId, userId, username, displayName, text, createdAt }`

### Places
- `GET /v1/places/{placeId}` → `PlaceDto = { placeId, name, lat, lng, address?, avgRating, ratingCount }`; 404
- `GET /v1/places/{placeId}/ratings?limit&cursor` → `RatingPage`
- `UserPlaceDto = { placeId, placeName, lat, lng, address?, lastVisited, visitCount }`
- Place stats (`avgRating`, `ratingCount`) = average of each user's LATEST rating at that place, rounded to 1 decimal (same rule as today).

### Caffeine
- `POST /v1/drinks/resolve-caffeine` body `{ drinkName }` → `{ caffeineMg: int, source: "table" | "ai" | "error" }`
  - First the static lookup table (port of `backend/src/lib/caffeine.ts`, incl. Lithuanian aliases, longest-substring-first). If no match, ask OpenAI
    (`OpenAi:ApiKey`; model `gpt-5-mini`; 15s timeout; any failure → `{ 0, "error" }`). The client may also ship the same table for instant local matches.

### Photos
- `POST /v1/photos/upload-url` body `{ fileName, contentType (image/*) }` → `{ uploadUrl, key, photoUrl }` — presigned S3 PUT (5 min). Client PUTs the bytes, then sends `key` as `photoKey`.

## Companions feature ("who drank coffee with me")

- Author picks companions when creating/editing a rating: from their friends list, by username search, or as free-text guest names.
- Stored on every copy of the rating as `companions` (list of maps). For each REGISTERED companion, an extra item
  `PK=USER#<companionUserId> SK=TAGGED#<createdAt>#<ratingId>` (attrs: ratingId, authorUserId, createdAt) is written so that
  `GET /v1/users/{username}/tagged` and the feed can find them cheaply (feed merges own + friends' + tagged ratings by createdAt).
- Deleting a rating or replacing companions removes stale `TAGGED#` items.
- UI: rating cards show "with Alice, Bob"; profile has a "Coffees with me" section; companion chips are tappable when they are registered users (→ public profile).

## DynamoDB single-table design (table `CoffeeApp`, unchanged keys; new rows marked NEW)

| Entity | PK | SK |
|---|---|---|
| User profile | `USER#<userId>` | `PROFILE` |
| User rating | `USER#<userId>` | `RATING#<createdAt>#<ratingId>` |
| User place | `USER#<userId>` | `PLACE#<placeId>` |
| Friend | `USER#<userId>` | `FRIEND#<friendUserId>` |
| Follower | `USER#<userId>` | `FOLLOWER#<followerUserId>` |
| Tagged (NEW) | `USER#<userId>` | `TAGGED#<createdAt>#<ratingId>` |
| Rating detail | `RATING#<ratingId>` | `META` |
| Like | `RATING#<ratingId>` | `LIKE#<userId>` |
| Comment | `RATING#<ratingId>` | `COMMENT#<createdAt>#<commentId>` |
| Place detail | `PLACE#<placeId>` | `META` |
| Place rating | `PLACE#<placeId>` | `RATING#<createdAt>#<ratingId>` |
| Username lookup | `USERNAME#<username>` | `USERNAME` (+ NEW `GSI1PK="USERNAME"`, `GSI1SK=<username>` for prefix search) |

Existing production data must keep working: same table name, same keys, same attribute names (`ratingId, userId, username, placeId, placeName, stars, drinkName, description, photoKey, lat, lng, address, caffeineMg, likeCount, commentCount, createdAt, updatedAt, entityType, totalCaffeineMg, passwordHash, displayName, friendUserId, ...`).
Missing `companions` attribute on old rows = empty list.
