import type React from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { colors } from '@/theme';
import type { MapBounds, MapRegion } from '@/lib/geo';

/**
 * The one contract both maps honour.
 *
 * `PlaceMap.tsx` draws it with react-native-maps (Apple Maps on iOS, Google Maps on Android) and
 * `PlaceMap.web.tsx` with Leaflet over OpenStreetMap tiles. Metro picks the file per platform, so
 * neither engine's imports ever reach the other bundle — which is the whole reason this type lives
 * in a third file rather than in either of them.
 */

/** One pin. Everything the marker needs to draw itself; the screen keeps the full place object. */
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** 0–5. `undefined` means "unrated / not applicable" and draws in the brand colour. */
  rating?: number;
  /** People I follow who have rated here — shown as a small badge when above zero. */
  friendCount?: number;
  /** I have been here: drawn with a ring so my own cafes stand out among strangers'. */
  visited?: boolean;
};

export type PlaceMapHandle = {
  /** Frame every current pin. No-op when there are none. */
  fitToPins: () => void;
  /** Move the camera to a region. */
  animateTo: (region: MapRegion) => void;
};

export type PlaceMapProps = {
  pins: MapPin[];
  /** Where the map opens. Read ONCE, at mount — move it afterwards through the ref. */
  region: MapRegion;
  /** Fired when the user stops moving the map. The screen debounces before querying. */
  onRegionChange?: (bounds: MapBounds) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** A second tap on an already-selected pin — the screen opens the place. */
  onOpen?: (id: string) => void;
  /** False for the static preview on a place screen: no panning, no zooming, no gestures. */
  interactive?: boolean;
  /** Draw the blue dot. Only pass true once location permission is actually granted. */
  showsUserLocation?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  ref?: React.Ref<PlaceMapHandle>;
};

/**
 * Pin colour by score: good coffee is espresso brown, decent is amber, the rest is muted so a
 * viewport full of mediocre cafes recedes. `undefined` (my own places, the single-pin preview)
 * takes the brand colour.
 *
 * On web every token is a `var(--coffee-*)` string, which is exactly what the Leaflet `divIcon`
 * HTML needs — so the two engines stay in step, dark mode included.
 */
export function pinTint(rating?: number): ColorValue {
  if (rating === undefined) return colors.primary;
  if (rating >= 4.5) return colors.primary;
  if (rating >= 3.5) return colors.amber;
  return colors.inkFaint;
}

/** Marker geometry, shared so a pin is the same size whichever engine drew it. */
export const PIN = { size: 22, selectedSize: 30, badge: 16 } as const;
