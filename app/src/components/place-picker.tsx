import { randomUUID } from 'expo-crypto';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CrosshairIcon, PinIcon, SearchIcon } from './icons';
import { Divider, Sheet, TextField, Txt } from './ui';
import { placeIdFromName } from '@/lib/place';
import { resolveHit, searchSuggestions, type SearchHit, type SearchSource } from '@/lib/placeSearch';
import { showToast } from '@/lib/toast';
import { useDebounced } from '@/lib/useDebounced';
import { colors, radius, spacing } from '@/theme';
import type { UserPlace } from '@/types';

/** What the composer needs to know about the chosen cafe. */
export type ChosenPlace = {
  placeId: string;
  placeName: string;
  address?: string;
  lat: number;
  lng: number;
};

/**
 * Picking the cafe: three ways in, in the order people actually use them.
 *
 * 1. Somewhere you have been before — one tap, and it keeps the existing `placeId` so the visit
 *    counts against the same place rather than creating a near-duplicate.
 * 2. Where you are right now — a reverse geocode of the device position, which on a phone in a cafe
 *    is usually the cafe.
 * 3. A search — Google Places through our own API (`GET /v1/places/suggest`, which holds the key
 *    server-side), falling back to Nominatim when that endpoint is not configured.
 *
 * Google bills autocomplete per SESSION, not per keystroke, so one UUID is minted when this sheet
 * opens, sent with every request, closed by the details call that resolves the chosen suggestion,
 * and then thrown away. Typing is debounced and each new query aborts the one before it.
 *
 * Whatever is picked, the `placeId` is derived from the NAME (`place_<snake_case>`), never from
 * Google's or OSM's id: production data is keyed that way and must keep matching, and neither
 * third-party id is stored anywhere.
 */
export function PlacePicker({
  visible,
  onClose,
  onSelect,
  previousPlaces,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (place: ChosenPlace) => void;
  previousPlaces: UserPlace[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 400);
  const [locating, setLocating] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // The results are stored WITH the query they answer, so "have we got results for what is typed
  // right now?" is a comparison rather than a second piece of state cleared from an effect.
  const [found, setFound] = useState<{ query: string; source: SearchSource; hits: SearchHit[] }>({
    query: '',
    source: 'nominatim',
    hits: [],
  });
  const results = found.query === debounced ? found.hits : [];
  const searching = visible && debounced.length >= 2 && found.query !== debounced;

  /**
   * One Google autocomplete session for this sheet: minted on the first keystroke that needs it,
   * reused for every later one, and closed by the details call in `pick`. Kept in a ref rather than
   * state because nothing renders from it.
   */
  const session = useRef<string | null>(null);
  const sessionToken = () => (session.current ??= randomUUID());
  const endSession = () => {
    session.current = null;
  };

  /**
   * Where the user is, IF we already know — it biases the suggestions towards nearby cafes. Read
   * from a permission we already hold; asking for one is what the "use my location" row is for.
   */
  const near = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // Without a device position (web, or permission never granted) bias towards the place the user
    // rated most recently — people mostly drink coffee in the same city. A real position, read
    // below, overrides it.
    if (!near.current && previousPlaces.length > 0) {
      const latest = previousPlaces.reduce((a, b) => (b.lastVisited > a.lastVisited ? b : a));
      if (Number.isFinite(latest.lat) && Number.isFinite(latest.lng)) {
        near.current = { lat: latest.lat, lng: latest.lng };
      }
    }
    void (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted || cancelled) return;
        const position = await Location.getLastKnownPositionAsync();
        if (position && !cancelled) {
          near.current = { lat: position.coords.latitude, lng: position.coords.longitude };
        }
      } catch {
        // Biasing is a nicety; without it the search is merely less local.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, previousPlaces]);

  useEffect(() => {
    if (!visible || debounced.length < 2) return;
    const controller = new AbortController();
    void searchSuggestions(debounced, sessionToken(), near.current, controller.signal).then(
      (outcome) => {
        if (!controller.signal.aborted) {
          setFound({ query: debounced, source: outcome.source, hits: outcome.hits });
        }
      },
    );
    return () => controller.abort();
  }, [debounced, visible]);

  const choose = (place: ChosenPlace) => {
    setQuery('');
    endSession();
    onSelect(place);
    onClose();
  };

  const dismiss = () => {
    endSession();
    onClose();
  };

  /**
   * A tapped suggestion. A Nominatim hit already has coordinates; a Google one needs the details
   * call, which is also what closes the billing session — hence the brief spinner on the row.
   */
  const pick = async (hit: SearchHit) => {
    if (resolvingId) return;
    setResolvingId(hit.id);
    try {
      const resolved = await resolveHit(hit, sessionToken());
      if (!resolved) {
        showToast(t('places.searchFailed'));
        return;
      }
      choose({
        placeId: placeIdFromName(resolved.name),
        placeName: resolved.name,
        address: resolved.address,
        lat: resolved.lat,
        lng: resolved.lng,
      });
    } finally {
      setResolvingId(null);
    }
  };

  // Not a hook, despite what the name would have implied — hence `locateMe`.
  const locateMe = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        showToast(t('places.locationDenied'));
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      near.current = { lat: latitude, lng: longitude };
      // The reverse geocode is a nicety: without it we still have coordinates, and the user can
      // type the cafe's name over whatever we guessed.
      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
      const name = address?.name ?? address?.street ?? t('places.useMyLocation');
      const full = [address?.street, address?.city, address?.country].filter(Boolean).join(', ');
      choose({
        placeId: placeIdFromName(name),
        placeName: name,
        address: full || undefined,
        lat: latitude,
        lng: longitude,
      });
    } catch {
      showToast(t('places.locationFailed'));
    } finally {
      setLocating(false);
    }
  };

  const previousMatches = previousPlaces.filter((p) =>
    query.trim() ? p.placeName.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );

  return (
    <Sheet visible={visible} onClose={dismiss} title={t('rating.place')}>
      <TextField
        placeholder={t('rating.placePlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        inputMode="search"
        autoFocus
      />

      <Pressable
        onPress={() => void locateMe()}
        accessibilityRole="button"
        accessibilityLabel={t('places.useMyLocation')}
        style={({ pressed }) => [s.locate, pressed && s.pressed]}>
        {locating ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <CrosshairIcon size={20} color={colors.primary} />
        )}
        <Txt variant="headline" tone="primary">
          {locating ? t('places.locating') : t('places.useMyLocation')}
        </Txt>
      </Pressable>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={s.list}>
        {previousMatches.length > 0 ? (
          <>
            <Txt variant="label" tone="faint" style={s.groupLabel}>
              {t('places.previous')}
            </Txt>
            <View style={s.group}>
              {previousMatches.map((p, i, arr) => (
                <View key={p.placeId}>
                  <Row
                    title={p.placeName}
                    subtitle={p.address}
                    onPress={() =>
                      choose({
                        placeId: p.placeId,
                        placeName: p.placeName,
                        address: p.address,
                        lat: p.lat,
                        lng: p.lng,
                      })
                    }
                  />
                  {i < arr.length - 1 ? <Divider inset={spacing.lg + 32} /> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {debounced.length >= 2 ? (
          <>
            <Txt variant="label" tone="faint" style={s.groupLabel}>
              {t('places.searchResults')}
            </Txt>
            <View style={s.group}>
              {searching ? (
                <View style={s.status}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : results.length === 0 ? (
                <View style={s.status}>
                  <SearchIcon size={18} color={colors.inkFaint} />
                  <Txt variant="label" tone="soft">
                    {t('places.noResults')}
                  </Txt>
                </View>
              ) : (
                results.map((r, i) => (
                  <View key={r.id}>
                    <Row
                      title={r.name}
                      subtitle={r.address}
                      busy={resolvingId === r.id}
                      onPress={() => void pick(r)}
                    />
                    {i < results.length - 1 ? <Divider inset={spacing.lg + 32} /> : null}
                  </View>
                ))
              )}
            </View>
            {/* Google requires the attribution whenever its suggestions are shown without a Google
                map alongside them. Nothing is required for the Nominatim fallback. */}
            {found.source === 'google' && results.length > 0 ? (
              <Txt variant="caption" tone="faint" style={s.attribution}>
                {t('places.poweredByGoogle')}
              </Txt>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function Row({
  title,
  subtitle,
  busy,
  onPress,
}: {
  title: string;
  subtitle?: string;
  /** The chosen Google suggestion, while its coordinates are being fetched. */
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy: !!busy }}
      style={({ pressed }) => [s.row, pressed && s.pressed]}>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <PinIcon size={18} color={colors.inkFaint} />
      )}
      <View style={s.rowText}>
        <Txt variant="headline" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" tone="faint" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.65 },
  locate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  list: { flex: 1, marginTop: spacing.sm },
  groupLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  group: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  rowText: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  attribution: { marginTop: spacing.xs, textAlign: 'right' },
});
