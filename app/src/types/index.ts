/**
 * Wire types — a 1:1 mirror of `docs/api-contract.md` (v1). Nothing here is derived or reshaped;
 * if the contract changes, this file changes first and the compiler finds the call sites.
 */

export interface User {
  userId: string;
  username: string;
  displayName: string;
  createdAt: string;
  /** Present on `GET /v1/me` and on public profiles. */
  totalCaffeineMg?: number;
}

/** A registered user (userId + username set) or a free-text guest (displayName only). */
export interface Companion {
  userId?: string;
  username?: string;
  displayName: string;
}

/** What the composer sends: at least one of the two. `username` must resolve server-side. */
export interface CompanionInput {
  username?: string;
  displayName?: string;
}

export interface Rating {
  ratingId: string;
  userId: string;
  username: string;
  displayName: string;
  placeId: string;
  placeName: string;
  address?: string;
  lat: number;
  lng: number;
  /** 1–5 in steps of 0.5. */
  stars: number;
  drinkName: string;
  description?: string;
  photoKey?: string;
  photoUrl?: string;
  caffeineMg: number;
  likeCount: number;
  commentCount: number;
  companions: Companion[];
  createdAt: string;
  updatedAt?: string;
}

/** Every paginated list of ratings: feed, a user's, a place's, "coffees with me". */
export interface RatingPage {
  ratings: Rating[];
  /** Which of `ratings` the signed-in user has liked. `[]` when unauthenticated. */
  likedRatingIds: string[];
  nextCursor: string | null;
}

export interface Like {
  userId: string;
  username: string;
  displayName: string;
}

export interface Comment {
  commentId: string;
  userId: string;
  username: string;
  displayName: string;
  text: string;
  createdAt: string;
}

export interface RatingDetail {
  rating: Rating;
  likes: Like[];
  comments: Comment[];
  isLikedByMe: boolean;
}

export interface Place {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  avgRating: number;
  ratingCount: number;
}

/** A place someone has been to, as listed on a profile. */
export interface UserPlace {
  placeId: string;
  placeName: string;
  lat: number;
  lng: number;
  address?: string;
  lastVisited: string;
  visitCount: number;
}

export interface Friend {
  friendUserId: string;
  friendUsername: string;
  friendDisplayName: string;
  addedAt: string;
}

export interface Follower {
  followerUserId: string;
  followerUsername: string;
  followerDisplayName: string;
  followedAt: string;
}

export interface CaffeineStats {
  todayMg: number;
  totalMg: number;
}

/** Where a caffeine number came from — the client shows "estimated by AI" for `ai`. */
export type CaffeineSource = 'table' | 'ai' | 'error';

export interface CaffeineResolution {
  caffeineMg: number;
  source: CaffeineSource;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface UploadTarget {
  uploadUrl: string;
  key: string;
  photoUrl: string;
}

/** Body of `POST /v1/ratings`. */
export interface CreateRatingInput {
  placeId: string;
  placeName: string;
  stars: number;
  drinkName: string;
  description?: string;
  photoKey?: string;
  lat: number;
  lng: number;
  address?: string;
  caffeineMg?: number;
  companions?: CompanionInput[];
}

/**
 * Body of `PUT /v1/ratings/{id}` — any subset. `null` clears a field (description, photoKey,
 * address); leaving a key out means "unchanged". `companions` REPLACES the whole list.
 */
export interface UpdateRatingInput {
  stars?: number;
  drinkName?: string;
  description?: string | null;
  photoKey?: string | null;
  caffeineMg?: number;
  placeName?: string;
  lat?: number;
  lng?: number;
  address?: string | null;
  companions?: CompanionInput[];
}
