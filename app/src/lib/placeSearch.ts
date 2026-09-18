import { api, errorCode } from './api';
import { searchPlaces } from './nominatim';
import type { ApiError } from './api';

/**
 * "Find me a cafe by name", with two sources behind one function.
 *
 * Google Places through our own API is the good one — it knows cafes, it biases to where you are
 * standing, and its key never leaves the server. But the key is optional config, so the endpoint is
 * allowed to answer 503, and a deployment without one must still let people find a cafe. Nominatim,
 * which needs no key and was this app's only search until now, is that floor.
 *
 * The fallback is transparent: the picker asks for suggestions and gets suggestions. It only learns
 * which source answered so it can show Google's required attribution when the answer was Google's.
 */

export type SearchSource = 'google' | 'nominatim';

/**
 * One row in the suggestions list. Google hits carry no coordinates — that is the second, billed
 * call — so a hit is resolved through `resolveHit` at the moment it is chosen, not before.
 */
export type SearchHit = {
  /** React key only. */
  id: string;
  name: string;
  address?: string;
  googlePlaceId?: string;
  lat?: number;
  lng?: number;
};

export type SearchOutcome = { source: SearchSource; hits: SearchHit[] };

/** Where a chosen hit actually is. */
export type ResolvedHit = { name: string; address?: string; lat: number; lng: number };

/**
 * Sticky for the life of the process: once the API has said it has no Google key, asking again on
 * every keystroke only wastes a round trip per search. A restart re-checks.
 */
let proxyUnavailable = false;

/** True once the proxy has told us it cannot serve — the picker uses it to skip the attribution. */
export function isProxyUnavailable(): boolean {
  return proxyUnavailable;
}

/** The two refusals that mean "do not ask me again this session". */
function isUnavailable(error: unknown): boolean {
  const status = (error as ApiError | undefined)?.status;
  const code = errorCode(error);
  return (
    status === 503 ||
    status === 502 ||
    code === 'place_search_unavailable' ||
    code === 'place_search_failed'
  );
}

/**
 * Up to 5 matches. Never throws — a search that cannot be served comes back empty and the composer
 * still lets the user type the cafe's name by hand.
 */
export async function searchSuggestions(
  query: string,
  session: string,
  near?: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const q = query.trim();
  if (q.length < 2) return { source: 'nominatim', hits: [] };

  if (!proxyUnavailable) {
    try {
      const { suggestions } = await api.suggestPlaces(
        { q, session, lat: near?.lat, lng: near?.lng },
        signal,
      );
      return {
        source: 'google',
        hits: suggestions.slice(0, 5).map((s) => ({
          id: s.googlePlaceId,
          name: s.name,
          address: s.address,
          googlePlaceId: s.googlePlaceId,
        })),
      };
    } catch (e) {
      if (signal?.aborted) return { source: 'google', hits: [] };
      if (isUnavailable(e)) proxyUnavailable = true;
      // Anything else (offline, a 500) also falls through to Nominatim for this one search, but
      // without writing the flag — the next keystroke may well succeed.
    }
  }

  const hits = await searchPlaces(q, signal);
  return {
    source: 'nominatim',
    hits: hits.map((h) => ({
      id: h.id,
      name: h.name,
      address: h.address,
      lat: h.lat,
      lng: h.lng,
    })),
  };
}

/**
 * The coordinates for a chosen hit. A Nominatim hit already has them; a Google one needs the
 * details call — which is also what closes the autocomplete session, so it must carry the same
 * `session` the suggestions did. `null` when the place cannot be resolved.
 */
export async function resolveHit(hit: SearchHit, session: string): Promise<ResolvedHit | null> {
  if (hit.lat !== undefined && hit.lng !== undefined) {
    return { name: hit.name, address: hit.address, lat: hit.lat, lng: hit.lng };
  }
  if (!hit.googlePlaceId) return null;
  try {
    const place = await api.resolveSuggestion(hit.googlePlaceId, session);
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
    // Google's display name wins over the autocomplete's main text when they differ.
    return {
      name: place.name || hit.name,
      address: place.address ?? hit.address,
      lat: place.lat,
      lng: place.lng,
    };
  } catch (e) {
    if (isUnavailable(e)) proxyUnavailable = true;
    return null;
  }
}
