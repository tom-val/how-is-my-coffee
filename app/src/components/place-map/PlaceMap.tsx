import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { PIN, pinTint, type MapPin, type PlaceMapHandle, type PlaceMapProps } from './types';
import { regionAround, regionToBounds, type MapRegion } from '@/lib/geo';
import { colors, fonts, radius } from '@/theme';

/**
 * The native map: react-native-maps with each platform's default provider — Apple Maps on iOS
 * (no key, no account) and Google Maps on Android (which does want a key; see `app.config.ts` and
 * the README. Without one Android draws an empty tile grid, which is ugly but not fatal).
 *
 * The web build never loads this file — Metro resolves `PlaceMap.web.tsx` instead — so nothing
 * here has to care about Leaflet, and neither bundle carries the other engine.
 */
export function PlaceMap({
  pins,
  region,
  onRegionChange,
  selectedId,
  onSelect,
  onOpen,
  interactive = true,
  showsUserLocation,
  style,
  accessibilityLabel,
  ref,
}: PlaceMapProps) {
  const map = useRef<MapView | null>(null);
  // `region` is the OPENING camera only. Frozen at mount — lazy `useState`, which is a render-safe
  // freeze — so a parent re-render (a new query result, a mode switch) never yanks the map back out
  // from under a user who has panned away.
  const [initial] = useState<Region>(() => toRegion(region));

  useImperativeHandle(
    ref,
    (): PlaceMapHandle => ({
      fitToPins: () => {
        if (pins.length === 0) return;
        if (pins.length === 1) {
          map.current?.animateToRegion(
            toRegion(regionAround({ lat: pins[0].lat, lng: pins[0].lng })),
            400,
          );
          return;
        }
        map.current?.fitToCoordinates(
          pins.map((p) => ({ latitude: p.lat, longitude: p.lng })),
          { edgePadding: { top: 64, right: 64, bottom: 64, left: 64 }, animated: true },
        );
      },
      animateTo: (next) => map.current?.animateToRegion(toRegion(next), 400),
    }),
    [pins],
  );

  return (
    <View
      style={[style, !interactive && s.static]}
      accessibilityLabel={accessibilityLabel}>
      <MapView
        ref={map}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={initial}
        onRegionChangeComplete={(next) => onRegionChange?.(regionToBounds(fromRegion(next)))}
        onPress={() => onSelect?.(null)}
        showsUserLocation={!!showsUserLocation}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}>
        {pins.map((pin) => (
          <PinMarker
            key={pinKey(pin, pin.id === selectedId)}
            pin={pin}
            selected={pin.id === selectedId}
            onPress={() => (pin.id === selectedId ? onOpen?.(pin.id) : onSelect?.(pin.id))}
          />
        ))}
      </MapView>
    </View>
  );
}

/** Everything that changes a marker's appearance, so a change remounts it. See `tracksViewChanges`. */
const pinKey = (pin: MapPin, selected: boolean) =>
  `${pin.id}:${selected}:${pin.rating ?? ''}:${pin.friendCount ?? 0}:${pin.visited ?? false}`;

/**
 * One marker, drawn by us rather than by the platform.
 *
 * `tracksViewChanges` is the catch: left on, every marker re-rasterises its React view on each
 * frame and a viewport of two hundred cafes crawls. Left off from the start, the marker can
 * rasterise before layout and show up blank. So it is on briefly after mount and after any change
 * that alters the pin's appearance, then off.
 */
function PinMarker({
  pin,
  selected,
  onPress,
}: {
  pin: MapPin;
  selected: boolean;
  onPress: () => void;
}) {
  const [tracks, setTracks] = useState(true);
  const friends = pin.friendCount ?? 0;

  // On at mount, off once the view has certainly been laid out and rasterised. Anything that
  // changes how the pin LOOKS changes its key in the parent, which remounts it and starts this
  // over — cheaper than leaving the whole field of markers tracking forever.
  useEffect(() => {
    const timer = setTimeout(() => setTracks(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const size = selected ? PIN.selectedSize : PIN.size;

  return (
    <Marker
      coordinate={{ latitude: pin.lat, longitude: pin.lng }}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      accessibilityLabel={pin.title}
      zIndex={selected ? 2 : 1}>
      <View style={s.wrap}>
        <View
          style={[
            s.dot,
            { width: size, height: size, backgroundColor: pinTint(pin.rating) },
            pin.visited && s.visited,
            selected && s.selected,
          ]}
        />
        {friends > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{friends > 9 ? '9+' : String(friends)}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

const toRegion = (r: MapRegion): Region => ({
  latitude: r.lat,
  longitude: r.lng,
  latitudeDelta: r.latDelta,
  longitudeDelta: r.lngDelta,
});

const fromRegion = (r: Region): MapRegion => ({
  lat: r.latitude,
  lng: r.longitude,
  latDelta: r.latitudeDelta,
  lngDelta: r.longitudeDelta,
});

const s = StyleSheet.create({
  // The static preview on a place screen is a picture: it must not swallow the page's scroll.
  static: { pointerEvents: 'none' },
  // Padded so the friends badge, which overhangs the dot, is inside the rasterised marker image.
  wrap: { padding: 8 },
  dot: {
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.onMedia,
    boxShadow: '0 1px 3px rgba(42, 33, 27, 0.45)',
  },
  visited: { borderWidth: 3, borderColor: colors.surface },
  selected: { borderWidth: 4, borderColor: colors.heading },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: PIN.badge,
    height: PIN.badge,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.heading,
    borderWidth: 1,
    borderColor: colors.onMedia,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, lineHeight: 12, color: colors.onMedia },
});
