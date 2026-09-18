import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CrosshairIcon, PinIcon, SearchIcon } from './icons';
import { Divider, Sheet, TextField, Txt } from './ui';
import { placeIdFromName } from '@/lib/place';
import { searchPlaces, type PlaceSuggestion } from '@/lib/nominatim';
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
 * 3. A search — Nominatim, the same source the old web client used.
 *
 * Whatever is picked, the `placeId` is derived from the NAME (`place_<snake_case>`), never from
 * OSM's id: production data is keyed that way and must keep matching.
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
  // The results are stored WITH the query they answer, so "have we got results for what is typed
  // right now?" is a comparison rather than a second piece of state cleared from an effect.
  const [found, setFound] = useState<{ query: string; items: PlaceSuggestion[] }>({
    query: '',
    items: [],
  });
  const results = found.query === debounced ? found.items : [];
  const searching = visible && debounced.length >= 2 && found.query !== debounced;

  useEffect(() => {
    if (!visible || debounced.length < 2) return;
    const controller = new AbortController();
    void searchPlaces(debounced, controller.signal).then((items) => {
      if (!controller.signal.aborted) setFound({ query: debounced, items });
    });
    return () => controller.abort();
  }, [debounced, visible]);

  const choose = (place: ChosenPlace) => {
    setQuery('');
    onSelect(place);
    onClose();
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
    <Sheet visible={visible} onClose={onClose} title={t('rating.place')}>
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

      <ScrollView keyboardShouldPersistTaps="handled" style={s.list}>
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
                      onPress={() =>
                        choose({
                          placeId: placeIdFromName(r.name),
                          placeName: r.name,
                          address: r.address,
                          lat: r.lat,
                          lng: r.lng,
                        })
                      }
                    />
                    {i < results.length - 1 ? <Divider inset={spacing.lg + 32} /> : null}
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function Row({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [s.row, pressed && s.pressed]}>
      <PinIcon size={18} color={colors.inkFaint} />
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
});
