import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { StarIcon } from './icons';
import { Txt } from './ui';
import { formatStars } from '@/lib/format';
import { colors, spacing } from '@/theme';

/**
 * Five stars, in halves.
 *
 * Read-only it is five glyphs and the number. Interactive, each star is split into two invisible
 * halves — tapping the left half of the third star gives 2.5 — which is how the old web client did
 * it and is still the least fiddly half-step control on a phone: no dragging, no long-press, and
 * each target is comfortably over the 44 pt minimum at the `lg` size.
 */
const SIZES = { sm: 15, md: 20, lg: 34 } as const;

export function StarRating({
  value,
  onChange,
  size = 'md',
  showValue = true,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: keyof typeof SIZES;
  showValue?: boolean;
}) {
  const { t } = useTranslation();
  const px = SIZES[size];

  return (
    <View style={s.row} accessibilityRole={onChange ? 'adjustable' : 'image'}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        const glyph = <StarIcon size={px} fill={fill} color={colors.amber} outline={colors.line} />;
        if (!onChange) return <View key={star}>{glyph}</View>;
        return (
          <View key={star} style={{ width: px, height: px }}>
            {glyph}
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View style={s.halves}>
                <Pressable
                  style={s.half}
                  hitSlop={{ top: 12, bottom: 12 }}
                  onPress={() => onChange(star - 0.5)}
                  accessibilityRole="button"
                  accessibilityLabel={t('rating.stars') + ` ${star - 0.5}`}
                />
                <Pressable
                  style={s.half}
                  hitSlop={{ top: 12, bottom: 12 }}
                  onPress={() => onChange(star)}
                  accessibilityRole="button"
                  accessibilityLabel={t('rating.stars') + ` ${star}`}
                />
              </View>
            </View>
          </View>
        );
      })}
      {showValue && value > 0 ? (
        <Txt variant="label" tone="soft" style={s.value}>
          {formatStars(value)}
        </Txt>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  halves: { flex: 1, flexDirection: 'row' },
  half: { flex: 1 },
  value: { marginLeft: spacing.xs },
});
