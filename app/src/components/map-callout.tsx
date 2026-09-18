import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRightIcon, PeopleIcon } from './icons';
import { StarRating } from './star-rating';
import { Txt } from './ui';
import { colors, radius, shadows, spacing } from '@/theme';

/**
 * The little card that appears over the map when a pin is tapped: what the place is called, how it
 * scored, and a tap target that opens it.
 *
 * It lives in the screen rather than inside either map engine on purpose — a native `Callout` and a
 * Leaflet `Popup` look nothing alike, and this one is ours in both places.
 */
export function MapCallout({
  title,
  rating,
  ratingCount,
  friendCount,
  note,
  onPress,
}: {
  title: string;
  /** Omitted for my own places, which have no aggregate score of their own. */
  rating?: number;
  ratingCount?: number;
  friendCount?: number;
  /** Used instead of stars when there is no rating — e.g. "3 visits". */
  note?: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => [s.card, pressed && s.pressed]}>
        <View style={s.text}>
          <Txt variant="headline" numberOfLines={1}>
            {title}
          </Txt>
          <View style={s.meta}>
            {rating !== undefined ? (
              <>
                <StarRating value={rating} size="sm" showValue={false} />
                {ratingCount !== undefined ? (
                  <Txt variant="caption" tone="faint">
                    {t('places.ratingCount', { count: ratingCount })}
                  </Txt>
                ) : null}
              </>
            ) : note ? (
              <Txt variant="caption" tone="faint" numberOfLines={1}>
                {note}
              </Txt>
            ) : null}
            {friendCount ? (
              <View style={s.friends}>
                <PeopleIcon size={12} color={colors.primary} />
                <Txt variant="caption" tone="primary">
                  {t('places.friendCount', { count: friendCount })}
                </Txt>
              </View>
            ) : null}
          </View>
        </View>
        <ChevronRightIcon size={18} color={colors.inkFaint} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.75 },
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    boxShadow: shadows.raised,
  },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  friends: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
