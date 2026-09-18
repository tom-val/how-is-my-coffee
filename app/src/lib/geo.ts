/**
 * The small amount of geometry the map needs, in one platform-neutral place.
 *
 * Two shapes travel between the screen and the map components:
 *   `MapRegion` — a centre plus how much of the world is on screen (what react-native-maps wants);
 *   `MapBounds` — the corners of the viewport (what Leaflet hands back, and what `GET /v1/places`
 *                 takes as `bbox`).
 * Both platform maps speak one of them natively and convert here, so neither the screen nor the
 * query key has to know which engine drew the tiles.
 */

export type LatLng = { lat: number; lng: number };

/** Centre + span. `latDelta`/`lngDelta` are the FULL visible span, not the half-span. */
export type MapRegion = { lat: number; lng: number; latDelta: number; lngDelta: number };

/** The viewport corners. Always normalised: `min <= max`, lat within ±85, lng within ±180. */
export type MapBounds = { minLat: number; minLng: number; maxLat: number; maxLng: number };

/** Cathedral Square — the fallback when we know nothing about the user at all. */
export const VILNIUS: MapRegion = { lat: 54.6872, lng: 25.2797, latDelta: 0.08, lngDelta: 0.13 };

/** Web Mercator gives up near the poles; every latitude we emit is clamped to its usable band. */
const MAX_LAT = 85;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function isFiniteCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Corners that the API will accept: inside the coordinate ranges and never crossing the
 * antimeridian (the endpoint answers 400 `invalid_bbox` for that, so a wrapped Leaflet viewport is
 * widened to the whole world instead of being sent as a reversed box).
 */
export function normalizeBounds(bounds: MapBounds): MapBounds {
  const minLat = clamp(Math.min(bounds.minLat, bounds.maxLat), -MAX_LAT, MAX_LAT);
  const maxLat = clamp(Math.max(bounds.minLat, bounds.maxLat), -MAX_LAT, MAX_LAT);
  let minLng = Math.min(bounds.minLng, bounds.maxLng);
  let maxLng = Math.max(bounds.minLng, bounds.maxLng);
  if (maxLng - minLng >= 360) {
    minLng = -180;
    maxLng = 180;
  } else {
    minLng = clamp(minLng, -180, 180);
    maxLng = clamp(maxLng, -180, 180);
  }
  return { minLat, minLng, maxLat, maxLng };
}

export function regionToBounds(region: MapRegion): MapBounds {
  const halfLat = Math.abs(region.latDelta) / 2;
  const halfLng = Math.abs(region.lngDelta) / 2;
  return normalizeBounds({
    minLat: region.lat - halfLat,
    maxLat: region.lat + halfLat,
    minLng: region.lng - halfLng,
    maxLng: region.lng + halfLng,
  });
}

export function boundsToRegion(bounds: MapBounds): MapRegion {
  const b = normalizeBounds(bounds);
  return {
    lat: (b.minLat + b.maxLat) / 2,
    lng: (b.minLng + b.maxLng) / 2,
    latDelta: Math.max(b.maxLat - b.minLat, MIN_DELTA),
    lngDelta: Math.max(b.maxLng - b.minLng, MIN_DELTA),
  };
}

/** Roughly a city block — the tightest we ever zoom, so a single pin does not land in the void. */
const MIN_DELTA = 0.004;

/** A region around one point, zoomed to street level. */
export function regionAround(point: LatLng, delta = 0.02): MapRegion {
  return { lat: point.lat, lng: point.lng, latDelta: delta, lngDelta: delta };
}

/**
 * The region that holds every point, with a little air around it. `null` when there is nothing to
 * frame, so callers can fall through to the next fallback rather than centre on (0, 0).
 */
export function regionForPoints(points: LatLng[], padding = 1.4): MapRegion | null {
  const usable = points.filter((p) => isFiniteCoord(p.lat, p.lng));
  if (usable.length === 0) return null;
  if (usable.length === 1) return regionAround(usable[0]);

  const lats = usable.map((p) => p.lat);
  const lngs = usable.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
    latDelta: Math.max((maxLat - minLat) * padding, MIN_DELTA),
    lngDelta: Math.max((maxLng - minLng) * padding, MIN_DELTA),
  };
}

/**
 * The `bbox` query value: `minLng,minLat,maxLng,maxLat`, rounded to ~110 m.
 *
 * The rounding is the whole point — it is also the TanStack Query key, so nudging the map by a few
 * metres re-reads the cache instead of asking the API again.
 */
export function bboxParam(bounds: MapBounds, decimals = 3): string {
  const b = normalizeBounds(bounds);
  const round = (n: number) => Number(n.toFixed(decimals));
  return [round(b.minLng), round(b.minLat), round(b.maxLng), round(b.maxLat)].join(',');
}
