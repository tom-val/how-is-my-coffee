import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRightIcon, ExternalIcon, PinIcon } from './icons';
import { Txt } from './ui';
import { formatDate } from '@/lib/format';
import { openInMaps } from '@/lib/place';
import { colors, radius, spacing } from '@/theme';
import type { UserPlace } from '@/types';

/**
 * One cafe in a "places I have been" list: name, how often, when last, and a direct hand-off to the
 * maps app. Grouped rows with a hairline between them, not a stack of individual cards — a list of
 * twenty cafes as twenty shadowed boxes is noise.
 */
export function PlaceRow({ place }: { place: UserPlace }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  return (
    <Pressable
      onPress={() => router.push(`/place/${place.placeId}`)}
      accessibilityRole="button"
      accessibilityLabel={place.placeName}
      style={({ pressed }) => [s.row, pressed && s.pressed]}>
      <View style={s.icon}>
        <PinIcon size={18} color={colors.primary} />
      </View>

      <View style={s.text}>
        <Txt variant="headline" numberOfLines={1}>
          {place.placeName}
        </Txt>
        <Txt variant="caption" tone="faint" numberOfLines={1}>
          {t('places.visits', { count: place.visitCount })} ·{' '}
          {t('places.lastVisited', { date: formatDate(place.lastVisited, i18n.language) })}
        </Txt>
      </View>

      <Pressable
        onPress={() => openInMaps(place.lat, place.lng, place.placeName)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('places.openInMaps')}
        style={({ pressed }) => [s.mapBtn, pressed && s.pressed]}>
        <ExternalIcon size={18} color={colors.primary} />
      </Pressable>

      <ChevronRightIcon size={18} color={colors.inkFaint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.65 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 60,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  mapBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
});
