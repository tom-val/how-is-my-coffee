import {
  divIcon,
  latLngBounds,
  type LatLngBoundsExpression,
  type Map as LeafletMap,
} from 'leaflet';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

import { PIN, pinTint, type MapPin, type PlaceMapHandle, type PlaceMapProps } from './types';
import { normalizeBounds, regionToBounds, type MapBounds, type MapRegion } from '@/lib/geo';
import { colors } from '@/theme';

/**
 * The web map: Leaflet over OpenStreetMap tiles, which need no key and no account — the same
 * bargain the rest of this app makes with Nominatim.
 *
 * Two Leaflet details are handled here rather than being left to bite later:
 *  - its stylesheet is not part of the JS bundle, so it is injected as a `<link>` once (the same
 *    trick `theme/css.ts` uses for the custom properties — `web.output` is `single`, so
 *    `+html.tsx` is never rendered and cannot carry it);
 *  - the default marker icon is a relative image URL that breaks under a bundler. We never use it:
 *    every pin is a `divIcon` styled with the theme's own custom properties, so web and native pins
 *    agree on colour and dark mode comes along for free.
 */
export function PlaceMap({
  pins,
  region,
  onRegionChange,
  selectedId,
  onSelect,
  onOpen,
  interactive = true,
  style,
  accessibilityLabel,
  ref,
}: PlaceMapProps) {
  const map = useRef<LeafletMap | null>(null);
  // Read once — lazy `useState` is a render-safe freeze. Afterwards the camera is the user's, and
  // moves only through the handle below.
  const [initial] = useState<LatLngBoundsExpression>(() => toLeafletBounds(regionToBounds(region)));

  useEffect(() => {
    injectLeafletCss();
  }, []);

  useImperativeHandle(
    ref,
    (): PlaceMapHandle => ({
      fitToPins: () => {
        if (!map.current || pins.length === 0) return;
        if (pins.length === 1) {
          map.current.setView([pins[0].lat, pins[0].lng], 16, { animate: true });
          return;
        }
        map.current.fitBounds(
          latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])),
          { padding: [40, 40] },
        );
      },
      animateTo: (next) => map.current?.flyTo([next.lat, next.lng], zoomForRegion(next, map.current)),
    }),
    [pins],
  );

  // SSR / prerender safety: Leaflet is a DOM library through and through. `web.output` is `single`
  // so this never actually runs on a server, but a blank box beats a "window is not defined".
  if (typeof window === 'undefined') {
    return <View style={[style, s.placeholder]} accessibilityLabel={accessibilityLabel} />;
  }

  return (
    <View
      style={[style, s.host, !interactive && s.static]}
      accessibilityLabel={accessibilityLabel}>
      <MapContainer
        bounds={initial}
        style={FILL}
        zoomControl={interactive}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        attributionControl>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <MapBridge mapRef={map} onRegionChange={onRegionChange} onBackgroundPress={onSelect} />
        {pins.map((pin) => (
          <Marker
            key={`${pin.id}:${pin.id === selectedId}`}
            position={[pin.lat, pin.lng]}
            icon={pinIcon(pin, pin.id === selectedId)}
            title={pin.title}
            eventHandlers={{
              click: () => (pin.id === selectedId ? onOpen?.(pin.id) : onSelect?.(pin.id)),
            }}
          />
        ))}
      </MapContainer>
    </View>
  );
}

/**
 * The only child that may touch the Leaflet instance: `useMap` has to run inside `MapContainer`.
 * It hands the instance up to the ref and turns "the user stopped moving" into viewport bounds.
 */
function MapBridge({
  mapRef,
  onRegionChange,
  onBackgroundPress,
}: {
  mapRef: RefObject<LeafletMap | null>;
  onRegionChange?: (bounds: MapBounds) => void;
  onBackgroundPress?: (id: null) => void;
}) {
  const instance = useMap();

  // The callback is held in a ref so the mount effect below does not re-run — and re-fire — every
  // time the screen hands down a fresh closure. A re-fire here means a new viewport query.
  const latest = useRef(onRegionChange);
  useEffect(() => {
    latest.current = onRegionChange;
  }, [onRegionChange]);

  const report = useCallback((m: LeafletMap) => {
    const b = m.getBounds();
    latest.current?.(
      normalizeBounds({
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
      }),
    );
  }, []);

  useMapEvents({
    moveend: (e) => report(e.target as LeafletMap),
    zoomend: (e) => report(e.target as LeafletMap),
    click: () => onBackgroundPress?.(null),
  });

  useEffect(() => {
    mapRef.current = instance;
    // Leaflet sizes itself from the container it mounted into; inside a flex column that container
    // can still be zero-height on the first tick. One invalidate after layout settles it — and
    // reports the viewport that finally resulted.
    const timer = setTimeout(() => {
      instance.invalidateSize();
      report(instance);
    }, 60);
    return () => {
      clearTimeout(timer);
      mapRef.current = null;
    };
  }, [instance, mapRef, report]);

  return null;
}

/** A pin as inline HTML — the same dot, ring and friends badge the native markers draw. */
function pinIcon(pin: MapPin, selected: boolean) {
  const size = selected ? PIN.selectedSize : PIN.size;
  const tint = String(pinTint(pin.rating));
  const ring = selected
    ? `4px solid ${String(colors.heading)}`
    : pin.visited
      ? `3px solid ${String(colors.surface)}`
      : `2px solid ${String(colors.onMedia)}`;
  const friends = pin.friendCount ?? 0;
  const badge =
    friends > 0
      ? `<span style="position:absolute;top:-4px;right:-6px;min-width:${PIN.badge}px;height:${PIN.badge}px;` +
        `padding:0 3px;border-radius:999px;background:${String(colors.heading)};color:${String(colors.onMedia)};` +
        `border:1px solid ${String(colors.onMedia)};font:700 9px/${PIN.badge}px system-ui,sans-serif;` +
        `text-align:center;box-sizing:border-box;">${friends > 9 ? '9+' : String(friends)}</span>`
      : '';

  return divIcon({
    className: 'kavute-pin',
    html:
      `<div style="position:relative;width:${size}px;height:${size}px;border-radius:999px;` +
      `background:${tint};border:${ring};box-shadow:0 1px 3px rgba(42,33,27,0.45);box-sizing:border-box;">${badge}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Leaflet zoom level that shows roughly `region.lngDelta` degrees across the current viewport. */
function zoomForRegion(region: MapRegion, map: LeafletMap): number {
  const width = map.getSize().x || 360;
  const zoom = Math.log2((360 * (width / 256)) / Math.max(region.lngDelta, 1e-6));
  return Math.min(19, Math.max(2, Math.round(zoom)));
}

const toLeafletBounds = (b: MapBounds): LatLngBoundsExpression => [
  [b.minLat, b.minLng],
  [b.maxLat, b.maxLng],
];

const FILL = { height: '100%', width: '100%' } as const;

const LEAFLET_CSS_ID = 'leaflet-css';
const KAVUTE_MAP_CSS_ID = 'kavute-map-css';

/**
 * Leaflet's stylesheet plus the few rules that make it look like the rest of the app. Idempotent,
 * and a no-op outside a browser.
 */
function injectLeafletCss(): void {
  if (typeof document === 'undefined') return;

  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement('link');
    link.id = LEAFLET_CSS_ID;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.crossOrigin = '';
    document.head.appendChild(link);
  }

  if (!document.getElementById(KAVUTE_MAP_CSS_ID)) {
    const style = document.createElement('style');
    style.id = KAVUTE_MAP_CSS_ID;
    style.textContent = `
.leaflet-container { background: var(--coffee-surface-alt); font-family: inherit; }
.leaflet-container a { color: var(--coffee-primary); }
.kavute-pin { background: none; border: 0; }
.leaflet-control-attribution { font-size: 10px; background: rgba(255, 255, 255, 0.72); }
`;
    document.head.appendChild(style);
  }
}

const s = StyleSheet.create({
  host: { overflow: 'hidden' },
  static: { pointerEvents: 'none' },
  placeholder: { backgroundColor: colors.surfaceAlt },
});
