import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/brand-header';
import { EmptyState } from '@/components/empty-state';
import { CrosshairIcon, PinIcon } from '@/components/icons';
import { MapCallout } from '@/components/map-callout';
import { MapPlaceRow } from '@/components/map-place-row';
import { PlaceMap } from '@/components/place-map/PlaceMap';
import type { MapPin, PlaceMapHandle } from '@/components/place-map/types';
import { PlaceRow } from '@/components/place-row';
import { SkeletonRow } from '@/components/skeleton';
import { Chip, Divider, SegmentedRow } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  bboxParam,
  isFiniteCoord,
  regionAround,
  regionForPoints,
  regionToBounds,
  VILNIUS,
  type MapBounds,
  type MapRegion,
} from '@/lib/geo';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { useDebounced } from '@/lib/useDebounced';
import { colors, radius, spacing } from '@/theme';
import type { MapPlace, UserPlace } from '@/types';

type Mode = 'mine' | 'discover';

/** The API caps `limit` at 300; a screenful of pins past a hundred is already soup. */
const MAP_LIMIT = 150;

/** How long the map has to sit still before we ask the API what is in the new viewport. */
const VIEWPORT_SETTLE_MS = 500;

/**
 * Places, map first.
 *
 * Two answers to "where do I get coffee": **Mine**, the cafes this account has actually rated, and
 * **Discover**, every cafe anyone has rated inside the current viewport (`GET /v1/places`, see the
 * contract). The map is the same component on all three platforms — react-native-maps on the
 * phones, Leaflet on the web — and the list underneath holds exactly what the pins above it show,
 * so tapping either half highlights the other.
 *
 * Discover only queries when the map has stopped moving, and the bbox is rounded before it becomes
 * a query key, so nudging the map a street over is a cache hit rather than a request.
 */
export default function PlacesScreen() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const router = useRouter();

  const map = useRef<PlaceMapHandle>(null);
  const list = useRef<FlatList<UserPlace | MapPlace>>(null);

  // ── my places ───────────────────────────────────────────────────────────────
  const mine = useQuery({
    queryKey: qk.userPlaces(me?.username ?? ''),
    queryFn: () => api.userPlaces(me!.username),
    enabled: !!me,
  });

  const myPlaces = useMemo(
    () =>
      [...(mine.data?.places ?? [])]
        .filter((p) => isFiniteCoord(p.lat, p.lng))
        .sort((a, b) => Date.parse(b.lastVisited) - Date.parse(a.lastVisited)),
    [mine.data],
  );

  // ── which half we are looking at ────────────────────────────────────────────
  // Derived rather than stored: until the user touches the segmented control there is no choice to
  // remember, only a default — Mine when there is something to show there, Discover when there is
  // not. Once they pick, `chosenMode` wins for good.
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const mode: Mode =
    chosenMode ?? (mine.isSuccess && (mine.data?.places.length ?? 0) === 0 ? 'discover' : 'mine');

  const chooseMode = (next: Mode) => {
    setSelectedId(null);
    setChosenMode(next);
  };

  // ── the opening camera ──────────────────────────────────────────────────────
  // Device position if we already hold the permission, else the middle of my own cafes, else
  // Vilnius. Frozen once the map is mounted: `region` is the map's initial camera, and after that
  // the user owns it.
  const [hasLocation, setHasLocation] = useState(false);
  const cameraMoved = useRef(false);

  // Nothing is rendered until the places query has settled, so this is computed once with the data
  // it needs. `PlaceMap` freezes whatever it is given at mount, so later recomputation is harmless.
  const ready = !mine.isPending || !me;
  const openingRegion: MapRegion = useMemo(
    () => regionForPoints(myPlaces.map((p) => ({ lat: p.lat, lng: p.lng }))) ?? VILNIUS,
    [myPlaces],
  );

  // Lazily, and never blocking: only READ the permission here — asking for it is what the
  // "locate me" button is for. If it is already granted, glide to where the user is standing.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled || !permission.granted) return;
        setHasLocation(true);
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const region = regionAround({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        if (!cameraMoved.current) map.current?.animateTo(region);
      } catch {
        // No location is not an error here — the fallback region is already on screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mine opens framed on every pin, once.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || mode !== 'mine' || myPlaces.length === 0) return;
    fitted.current = true;
    cameraMoved.current = true;
    map.current?.fitToPins();
  }, [mode, myPlaces.length]);

  // ── discovery ───────────────────────────────────────────────────────────────
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [friendsOnly, setFriendsOnly] = useState(false);

  // The map reports every settled viewport; this waits for the panning to actually stop. Until the
  // first report arrives the opening camera stands in for it, so Discover has pins on screen
  // without waiting for the map to announce itself (both engines do, but not at the same moment,
  // and one of them is on a timer).
  const settledBounds = useDebounced(bounds, VIEWPORT_SETTLE_MS);
  const viewport = settledBounds ?? (ready ? regionToBounds(openingRegion) : null);
  const bbox = viewport ? bboxParam(viewport) : null;

  const onRegionChange = useCallback((next: MapBounds) => {
    cameraMoved.current = true;
    setBounds(next);
  }, []);

  // A disabled query stays `pending` forever, so this gates the skeleton too — otherwise a
  // signed-out or still-booting session would sit under placeholder rows that never resolve.
  const discoverEnabled = mode === 'discover' && !!bbox && !!me;

  const discover = useQuery({
    queryKey: qk.mapPlaces(bbox ?? '', friendsOnly),
    queryFn: () => api.mapPlaces({ bbox: bbox!, friends: friendsOnly, limit: MAP_LIMIT }),
    enabled: discoverEnabled,
    // Keep the old pins on screen while the new viewport loads — otherwise every pan blinks.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const discovered = useMemo(() => discover.data?.places ?? [], [discover.data]);

  // ── pins and selection ──────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pins: MapPin[] = useMemo(
    () =>
      mode === 'mine'
        ? myPlaces.map((p) => ({
            id: p.placeId,
            lat: p.lat,
            lng: p.lng,
            title: p.placeName,
            visited: true,
          }))
        : discovered
            .filter((p) => isFiniteCoord(p.lat, p.lng))
            .map((p) => ({
              id: p.placeId,
              lat: p.lat,
              lng: p.lng,
              title: p.name,
              rating: p.avgRating,
              friendCount: p.friendCount,
              visited: p.visitedByMe,
            })),
    [mode, myPlaces, discovered],
  );

  const rows: (UserPlace | MapPlace)[] = mode === 'mine' ? myPlaces : discovered;

  // A pin tap scrolls its row into view. `scrollToIndex` can fail on a row that has never been
  // measured, which is exactly the case here, so the failure handler finishes the job.
  const select = (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const index = rows.findIndex((r) => rowId(r) === id);
    if (index < 0) return;
    list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  };

  const open = (placeId: string) => router.push(`/place/${placeId}`);

  const [locating, setLocating] = useState(false);

  const locateMe = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        showToast(t('places.locationDenied'));
        return;
      }
      setHasLocation(true);
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const region = regionAround({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      cameraMoved.current = true;
      map.current?.animateTo(region);
    } catch {
      showToast(t('places.locationFailed'));
    } finally {
      setLocating(false);
    }
  };

  const selectedPlace = selectedId ? rows.find((r) => rowId(r) === selectedId) : undefined;

  // ── screen ──────────────────────────────────────────────────────────────────
  const onMine = mode === 'mine';
  const showSkeleton = onMine ? mine.isPending && !!me : discover.isPending && discoverEnabled;
  const failed = onMine ? mine.isError : discover.isError;
  const failure = onMine ? mine.error : discover.error;
  const refreshing = onMine ? mine.isRefetching : discover.isRefetching;
  const refetch = () => void (onMine ? mine.refetch() : discover.refetch());

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <BrandHeader title={t('places.title')} />

      <View style={s.controls}>
        <SegmentedRow<Mode>
          value={mode}
          onChange={chooseMode}
          options={[
            { value: 'mine', label: t('places.mine') },
            { value: 'discover', label: t('places.discover') },
          ]}
        />
        {mode === 'discover' ? (
          <View style={s.filters}>
            <Chip
              label={t('places.friendsOnly')}
              selected={friendsOnly}
              onPress={() => setFriendsOnly((on) => !on)}
            />
            {discover.isFetching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
        ) : null}
      </View>

      <View style={s.mapSlot}>
        {ready ? (
          <PlaceMap
            ref={map}
            style={StyleSheet.absoluteFill}
            pins={pins}
            region={openingRegion}
            onRegionChange={onRegionChange}
            selectedId={selectedId}
            onSelect={select}
            onOpen={open}
            showsUserLocation={hasLocation}
            accessibilityLabel={t('places.map')}
          />
        ) : null}

        <Pressable
          onPress={() => void locateMe()}
          accessibilityRole="button"
          accessibilityLabel={t('places.locateMe')}
          style={({ pressed }) => [s.locate, pressed && s.pressed]}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <CrosshairIcon size={20} color={colors.primary} />
          )}
        </Pressable>

        {selectedPlace ? (
          <MapCallout
            title={'name' in selectedPlace ? selectedPlace.name : selectedPlace.placeName}
            rating={'avgRating' in selectedPlace ? selectedPlace.avgRating : undefined}
            ratingCount={'ratingCount' in selectedPlace ? selectedPlace.ratingCount : undefined}
            friendCount={'friendCount' in selectedPlace ? selectedPlace.friendCount : undefined}
            note={
              'visitCount' in selectedPlace
                ? t('places.visits', { count: selectedPlace.visitCount })
                : undefined
            }
            onPress={() => open(rowId(selectedPlace))}
          />
        ) : null}
      </View>

      <View style={s.listSlot}>
        {showSkeleton ? (
          <View style={s.padded}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : failed ? (
          <EmptyState
            title={t('common.somethingWrong')}
            body={errorMessage(failure, t)}
            actionLabel={t('common.retry')}
            onAction={refetch}
          />
        ) : (
          <FlatList
            ref={list}
            data={rows}
            extraData={selectedId}
            keyExtractor={rowId}
            contentContainerStyle={s.content}
            renderItem={({ item }) =>
              'placeName' in item ? (
                <PlaceRow
                  place={item}
                  selected={item.placeId === selectedId}
                  onPress={() =>
                    item.placeId === selectedId ? open(item.placeId) : select(item.placeId)
                  }
                />
              ) : (
                <MapPlaceRow
                  place={item}
                  selected={item.placeId === selectedId}
                  onPress={() =>
                    item.placeId === selectedId ? open(item.placeId) : select(item.placeId)
                  }
                />
              )
            }
            ItemSeparatorComponent={() => <Divider inset={spacing.lg + 36 + spacing.md} />}
            onScrollToIndexFailed={({ index }) => {
              list.current?.scrollToOffset({ offset: index * 72, animated: true });
            }}
            ListEmptyComponent={
              mode === 'mine' ? (
                <EmptyState
                  icon={<PinIcon size={26} color={colors.inkFaint} />}
                  title={t('places.emptyTitle')}
                  body={t('places.emptyBody')}
                  actionLabel={t('feed.rateFirst')}
                  onAction={() => router.push('/rating/new')}
                />
              ) : (
                <EmptyState
                  icon={<PinIcon size={26} color={colors.inkFaint} />}
                  title={t('places.nothingHere')}
                  body={
                    friendsOnly ? t('places.nothingHereFriends') : t('places.nothingHereBody')
                  }
                />
              )
            }
            refreshing={refreshing}
            onRefresh={refetch}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/** Both row shapes carry `placeId`; this is the only thing the list needs from either. */
const rowId = (row: UserPlace | MapPlace) => row.placeId;

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  filters: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // 55 / 45 of whatever is left under the bar — a ratio rather than a measured height, so it holds
  // on a small phone, a tablet and the 500 px web column alike.
  mapSlot: {
    flex: 55,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    minHeight: 220,
  },
  listSlot: { flex: 45 },
  locate: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    boxShadow: '0 2px 6px rgba(42, 33, 27, 0.18)',
  },
  padded: { padding: spacing.lg },
  content: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    margin: spacing.lg,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
});
