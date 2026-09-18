/**
 * The one door to the coffee API (see `docs/api-contract.md`). Every screen goes through `api.*`;
 * nothing else in the app calls `fetch` against our own backend.
 *
 * Shape of the contract, encoded here once:
 *  - base URL from `config.apiUrl`, every path prefixed `/v1` (except `/health`);
 *  - `Authorization: Bearer <jwt>` when signed in;
 *  - errors are `{ "error": "<snake_case code or prose>" }` with a proper status;
 *  - lists are cursor-paginated: `?limit&cursor` in, `nextCursor` out.
 */
import { config } from './config';
import type {
  AuthResult,
  CaffeineResolution,
  CaffeineStats,
  Comment,
  CreateRatingInput,
  Follower,
  Friend,
  MapPlace,
  Place,
  PlaceSuggestionDto,
  ResolvedPlace,
  Rating,
  RatingDetail,
  RatingPage,
  UpdateRatingInput,
  UploadTarget,
  User,
  UserPlace,
} from '@/types';

// The JWT for the current session. Owned by `lib/auth.tsx`, which is the only caller of `setAuth`.
let accessToken: string | null = null;

/** Called when the API rejects our token. `lib/auth.tsx` wires this to "sign out + go to login". */
let onUnauthorized: (() => void) | null = null;

export function setAuth(token: string | null): void {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** API failure carrying the HTTP status (0 = network error) and the raw server body. */
export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, message: string, detail = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** The `error` string out of a `{ "error": "…" }` body; the raw text when it isn't that shape. */
function errorBody(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { error?: unknown };
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    // not JSON
  }
  return detail;
}

/**
 * The stable snake_case code a response carried (e.g. `username_taken`), or null when the body was
 * prose. Lets a screen react to a specific refusal rather than only showing its message.
 */
export function errorCode(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  const text = errorBody(e.detail);
  return /^[a-z][a-z0-9_]*$/.test(text) ? text : null;
}

/**
 * Maps an error to a user-facing, localized message. A stable code wins (`errors.<code>`), then the
 * status, then whatever prose the server sent.
 */
export function errorMessage(
  e: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (__DEV__) console.warn('[api]', e);
  if (e instanceof ApiError) {
    if (e.status === 0) return t('errors.network');
    const code = errorCode(e);
    if (code) {
      const localized = t(`errors.${code}`, { defaultValue: '' });
      if (localized) return localized;
    }
    if (e.status === 401) return t('errors.unauthorized');
    if (e.status === 403) return t('errors.forbidden');
    if (e.status === 404) return t('errors.not_found');
    if (e.status >= 500) return t('errors.server');
    return errorBody(e.detail) || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.body !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  } catch (e) {
    throw new ApiError(0, 'Network request failed', e instanceof Error ? e.message : String(e));
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // A rejected token is a session-level event, not a screen-level one: drop it and send the user
    // to sign in. Public reads (a profile shared by link) never 401, so this can't loop.
    if (res.status === 401 && accessToken) onUnauthorized?.();
    throw new ApiError(res.status, `API ${res.status} ${res.statusText}`, text);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** `?limit=10&cursor=…`, with empty values dropped. */
function pageQuery(opts?: { limit?: number; cursor?: string | null }): string {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.cursor) params.set('cursor', opts.cursor);
  const q = params.toString();
  return q ? `?${q}` : '';
}

/** Default page size. The API caps it at 50. */
export const PAGE_SIZE = 10;

export const api = {
  // ── health ────────────────────────────────────────────────────────────────
  health: () => request<{ status: string }>('/health'),

  // ── auth / users ──────────────────────────────────────────────────────────
  register: (body: { username: string; displayName: string; password: string }) =>
    request<AuthResult>('/v1/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { username: string; password: string }) =>
    request<AuthResult>('/v1/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  me: () => request<User>('/v1/me'),

  /** Public: works signed-out. */
  user: (username: string) => request<User>(`/v1/users/${encodeURIComponent(username)}`),

  /** Public: `likedRatingIds` comes back empty when unauthenticated. */
  userRatings: (username: string, opts?: { limit?: number; cursor?: string | null }) =>
    request<RatingPage>(`/v1/users/${encodeURIComponent(username)}/ratings${pageQuery(opts)}`),

  userPlaces: (username: string) =>
    request<{ places: UserPlace[] }>(`/v1/users/${encodeURIComponent(username)}/places`),

  userCaffeine: (username: string) =>
    request<CaffeineStats>(`/v1/users/${encodeURIComponent(username)}/caffeine`),

  /** "Coffees with me" — ratings this user was tagged in as a companion. */
  userTagged: (username: string, opts?: { limit?: number; cursor?: string | null }) =>
    request<RatingPage>(`/v1/users/${encodeURIComponent(username)}/tagged${pageQuery(opts)}`),

  /** Username prefix search (min 2 chars), up to 10 hits. Powers add-friend and the companion picker. */
  searchUsers: (q: string) =>
    request<{ users: User[] }>(`/v1/users/search?q=${encodeURIComponent(q)}`),

  // ── friends ───────────────────────────────────────────────────────────────
  friends: () => request<{ friends: Friend[] }>('/v1/friends'),

  followers: () => request<{ followers: Follower[] }>('/v1/followers'),

  addFriend: (friendUsername: string) =>
    request<Friend>('/v1/friends', { method: 'POST', body: JSON.stringify({ friendUsername }) }),

  removeFriend: (friendUserId: string) =>
    request<{ status: string }>(`/v1/friends/${encodeURIComponent(friendUserId)}`, {
      method: 'DELETE',
    }),

  // ── ratings ───────────────────────────────────────────────────────────────
  feed: (opts?: { limit?: number; cursor?: string | null }) =>
    request<RatingPage>(`/v1/feed${pageQuery(opts)}`),

  createRating: (body: CreateRatingInput) =>
    request<Rating>('/v1/ratings', { method: 'POST', body: JSON.stringify(body) }),

  rating: (ratingId: string) =>
    request<RatingDetail>(`/v1/ratings/${encodeURIComponent(ratingId)}`),

  updateRating: (ratingId: string, body: UpdateRatingInput) =>
    request<Rating>(`/v1/ratings/${encodeURIComponent(ratingId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteRating: (ratingId: string) =>
    request<{ status: string }>(`/v1/ratings/${encodeURIComponent(ratingId)}`, {
      method: 'DELETE',
    }),

  /** Toggle — the response says which way it went. */
  toggleLike: (ratingId: string) =>
    request<{ liked: boolean; likeCount: number }>(
      `/v1/ratings/${encodeURIComponent(ratingId)}/like`,
      { method: 'POST' },
    ),

  addComment: (ratingId: string, text: string) =>
    request<Comment>(`/v1/ratings/${encodeURIComponent(ratingId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // ── places ────────────────────────────────────────────────────────────────
  /**
   * Every cafe anyone has rated inside the map viewport.
   *
   * `bbox` is `minLng,minLat,maxLng,maxLat` (see `lib/geo.ts`, which rounds it so a small pan hits
   * the cache instead of the network). `friends: true` narrows it to places the people I follow —
   * or I — have rated. The server caps `limit` at 300 and keeps the most-rated places past that.
   */
  mapPlaces: (opts: { bbox: string; friends?: boolean; limit?: number }) => {
    const params = new URLSearchParams({ bbox: opts.bbox });
    if (opts.friends) params.set('friends', 'true');
    if (opts.limit) params.set('limit', String(opts.limit));
    return request<{ places: MapPlace[] }>(`/v1/places?${params.toString()}`);
  },

  /**
   * Place autocomplete, proxied server-side so the Google key stays on the server.
   *
   * `session` is one UUID for a whole typing session plus the `resolveSuggestion` that ends it —
   * Google bills the lot as a single session rather than per keystroke. `lat`/`lng` bias the
   * results towards the user and are optional. Answers 503 `place_search_unavailable` when the
   * server has no key configured, which is the caller's cue to fall back to Nominatim.
   */
  suggestPlaces: (
    opts: { q: string; session: string; lat?: number; lng?: number },
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({ q: opts.q, session: opts.session });
    if (opts.lat !== undefined && opts.lng !== undefined) {
      params.set('lat', String(opts.lat));
      params.set('lng', String(opts.lng));
    }
    return request<{ suggestions: PlaceSuggestionDto[] }>(
      `/v1/places/suggest?${params.toString()}`,
      { signal },
    );
  },

  /** The coordinates behind one suggestion. Pass the SAME `session` the suggestions came from. */
  resolveSuggestion: (googlePlaceId: string, session: string, signal?: AbortSignal) =>
    request<ResolvedPlace>(
      `/v1/places/suggest/${encodeURIComponent(googlePlaceId)}?session=${encodeURIComponent(session)}`,
      { signal },
    ),

  place: (placeId: string) => request<Place>(`/v1/places/${encodeURIComponent(placeId)}`),

  placeRatings: (placeId: string, opts?: { limit?: number; cursor?: string | null }) =>
    request<RatingPage>(`/v1/places/${encodeURIComponent(placeId)}/ratings${pageQuery(opts)}`),

  // ── caffeine ──────────────────────────────────────────────────────────────
  /** Server-side lookup: static table first, then the AI estimate. Never throws for "unknown". */
  resolveCaffeine: (drinkName: string) =>
    request<CaffeineResolution>('/v1/drinks/resolve-caffeine', {
      method: 'POST',
      body: JSON.stringify({ drinkName }),
    }),

  // ── photos ────────────────────────────────────────────────────────────────
  /** Step 1 of a photo upload: ask for a presigned S3 PUT. See `lib/photo.ts` for the whole dance. */
  uploadUrl: (body: { fileName: string; contentType: string }) =>
    request<UploadTarget>('/v1/photos/upload-url', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
