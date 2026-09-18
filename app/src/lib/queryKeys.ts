/**
 * Every TanStack Query key in one place.
 *
 * Centralised because the optimistic like toggle has to reach into *all* the caches a rating can
 * appear in (feed, a profile's ratings, a place's ratings, "coffees with me", the detail view) —
 * see `useToggleLike`. Keys spelled inline at call sites drift, and a drifted key means a heart
 * that flips back a second later.
 */
export const qk = {
  me: () => ['me'] as const,
  user: (username: string) => ['user', username] as const,
  userRatings: (username: string) => ['userRatings', username] as const,
  userPlaces: (username: string) => ['userPlaces', username] as const,
  userCaffeine: (username: string) => ['userCaffeine', username] as const,
  userTagged: (username: string) => ['userTagged', username] as const,
  feed: () => ['feed'] as const,
  friends: () => ['friends'] as const,
  followers: () => ['followers'] as const,
  userSearch: (q: string) => ['userSearch', q] as const,
  rating: (ratingId: string) => ['rating', ratingId] as const,
  place: (placeId: string) => ['place', placeId] as const,
  placeRatings: (placeId: string) => ['placeRatings', placeId] as const,
};

/** Read-only key type — `unknown[]` is what `queryClient.setQueryData` wants. */
export type QueryKey = readonly unknown[];
