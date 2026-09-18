import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { CheckIcon, ChevronRightIcon, PeopleIcon, PinIcon } from './icons';
import { StarRating } from './star-rating';
import { Txt } from './ui';
import { pinTint } from './place-map/types';
import { colors, radius, spacing } from '@/theme';
import type { MapPlace } from '@/types';

/**
 * One cafe in the Discover list — the same place the pin above it marks.
 *
 * It answers the two questions the map cannot: is this any good (stars and how many people said
 * so), and does it mean anything to me (friends who have rated it, whether I have been). The dot
 * on the left repeats the pin's colour so a row and its pin read as one thing.
 */
export function MapPlaceRow({
  place,
  selected,
  onPress,
}: {
  place: MapPlace;
  selected?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={place.name}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [s.row, selected && s.selected, pressed && s.pressed]}>
      <View style={[s.icon, { backgroundColor: pinTint(place.avgRating) }]}>
        <PinIcon size={16} color={colors.onMedia} />
      </View>

      <View style={s.text}>
        <Txt variant="headline" numberOfLines={1}>
          {place.name}
        </Txt>

        <View style={s.stats}>
          <StarRating value={place.avgRating} size="sm" showValue={false} />
          <Txt variant="caption" tone="faint" numberOfLines={1}>
            {t('places.ratingCount', { count: place.ratingCount })}
          </Txt>
        </View>

        {place.friendCount > 0 || place.visitedByMe ? (
          <View style={s.badges}>
            {place.friendCount > 0 ? (
              <View style={s.badge}>
                <PeopleIcon size={12} color={colors.primary} />
                <Txt variant="caption" tone="primary">
                  {t('places.friendCount', { count: place.friendCount })}
                </Txt>
              </View>
            ) : null}
            {place.visitedByMe ? (
              <View style={[s.badge, s.badgeGood]}>
                <CheckIcon size={12} color={colors.good} />
                <Txt variant="caption" style={s.goodText}>
                  {t('places.visited')}
                </Txt>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

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
  selected: { backgroundColor: colors.primarySoft },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  badgeGood: { backgroundColor: colors.goodSoft },
  goodText: { color: colors.good },
});
