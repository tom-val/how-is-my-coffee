import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ExternalIcon, PinIcon } from '@/components/icons';
import { PlaceMap } from '@/components/place-map/PlaceMap';
import { RatingList } from '@/components/rating-list';
import { StarRating } from '@/components/star-rating';
import { ScreenHeader, Txt } from '@/components/ui';
import { api, errorMessage, PAGE_SIZE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isFiniteCoord, regionAround } from '@/lib/geo';
import { openInMaps } from '@/lib/place';
import { qk } from '@/lib/queryKeys';
import { colors, radius, spacing } from '@/theme';

/**
 * A cafe: where it is, its average across everyone's latest visit, how many ratings it has, and the
 * ratings themselves. The map at the top is a picture — it does not pan or zoom, because this
 * screen is about the coffee. "Open in Maps" still hands the coordinates to the phone's own map app
 * (or OpenStreetMap on the web) for the part we are not trying to be: directions.
 */
export default function PlaceScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { me } = useAuth();

  const place = useQuery({
    queryKey: qk.place(placeId),
    queryFn: () => api.place(placeId),
    enabled: !!placeId,
  });

  if (place.isError) {
    return (
      <View style={s.screen}>
        <ScreenHeader title={t('places.title')} onBack={() => router.back()} />
        <EmptyState
          title={t('places.notFound')}
          body={errorMessage(place.error, t)}
          actionLabel={t('common.retry')}
          onAction={() => void place.refetch()}
        />
      </View>
    );
  }

  const located = place.data && isFiniteCoord(place.data.lat, place.data.lng) ? place.data : null;

  const header = (
    <View style={s.header}>
      {located ? (
        <PlaceMap
          style={s.map}
          interactive={false}
          region={regionAround({ lat: located.lat, lng: located.lng }, 0.006)}
          pins={[{ id: located.placeId, lat: located.lat, lng: located.lng, title: located.name }]}
          accessibilityLabel={located.name}
        />
      ) : null}

      <Txt variant="title" tone="heading" numberOfLines={2}>
        {place.data?.name ?? ''}
      </Txt>

      {place.data ? (
        <View style={s.statsRow}>
          <StarRating value={place.data.avgRating} size="sm" />
          <Txt variant="label" tone="faint">
            {t('places.ratingCount', { count: place.data.ratingCount })}
          </Txt>
        </View>
      ) : null}

      {place.data ? (
        <Pressable
          onPress={() => openInMaps(place.data.lat, place.data.lng, place.data.name)}
          accessibilityRole="button"
          accessibilityLabel={t('places.openInMaps')}
          style={({ pressed }) => [s.mapRow, pressed && s.pressed]}>
          <PinIcon size={18} color={colors.primary} />
          <View style={s.flex}>
            <Txt variant="label" tone="primary" numberOfLines={2}>
              {place.data.address ?? t('places.openInMaps')}
            </Txt>
          </View>
          <ExternalIcon size={18} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={place.data?.name ?? t('places.title')}
        onBack={() => router.back()}
      />
      <RatingList
        queryKey={qk.placeRatings(placeId)}
        fetchPage={(cursor) => api.placeRatings(placeId, { cursor, limit: PAGE_SIZE })}
        likeKeys={me ? [qk.feed(), qk.userRatings(me.username)] : [qk.feed()]}
        enabled={!!placeId}
        header={header}
        emptyTitle={t('places.noRatings')}
        showPlace={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { gap: spacing.sm, paddingBottom: spacing.lg },
  map: {
    height: 160,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: spacing.md,
  },
});
