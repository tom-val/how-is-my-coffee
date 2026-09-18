import { Platform } from 'react-native';

/**
 * Place search against OpenStreetMap's Nominatim — the app's only third-party network call.
 *
 * Nominatim's usage policy asks for an identifying User-Agent and no more than one request a
 * second. We send the header on native (browsers forbid setting it, and send their own anyway) and
 * the callers debounce typing, so a search is one request per pause, not one per keystroke.
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Kavute/1.0 (https://github.com/tom-val/how-is-my-coffee)';

export type PlaceSuggestion = {
  /** Nominatim's own id, used only as a React key. */
  id: string;
  /** The short name we put in `placeName` — the first comma-separated part of the display name. */
  name: string;
  /** The full display name, shown as the secondary line and stored as `address`. */
  address: string;
  lat: number;
  lng: number;
};

type NominatimResult = {
  place_id?: number | string;
  osm_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
};

/**
 * Up to 5 matches for a free-text query. Never throws: a search that fails (offline, rate-limited,
 * blocked) returns an empty list, and the composer still lets the user type a place name by hand.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (Platform.OS !== 'web') headers['User-Agent'] = USER_AGENT;

  try {
    const res = await fetch(
      `${ENDPOINT}?q=${encodeURIComponent(q)}&format=json&addressdetails=0&limit=5`,
      { headers, signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimResult[];
    if (!Array.isArray(data)) return [];
    return data
      .map((r, i): PlaceSuggestion | null => {
        const lat = Number(r.lat);
        const lng = Number(r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const display = r.display_name ?? r.name ?? q;
        return {
          id: String(r.place_id ?? r.osm_id ?? i),
          name: (r.name ?? display.split(',')[0] ?? display).trim(),
          address: display,
          lat,
          lng,
        };
      })
      .filter((r): r is PlaceSuggestion => r !== null);
  } catch {
    return []; // offline, aborted, or rate-limited — the caller falls back to manual entry
  }
}
