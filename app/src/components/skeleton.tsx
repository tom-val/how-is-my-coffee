import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

/**
 * Placeholder blocks for a first load.
 *
 * A list's first load shows the shape of what is coming rather than a centred spinner: the spinner
 * blink (spinner → sudden content, or worse, a flash of "nothing here yet") is one of the tells
 * that an app was not thought through. Subsequent pages use a small inline spinner instead, because
 * by then the user already sees content.
 */
export function SkeletonLine({ width = '100%', height = 12 }: { width?: number | `${number}%`; height?: number }) {
  return <View style={[s.block, { width, height, borderRadius: height / 2 }]} />;
}

export function SkeletonRatingCard() {
  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <View style={s.avatar} />
        <View style={s.headText}>
          <SkeletonLine width="55%" height={13} />
          <SkeletonLine width="35%" height={11} />
        </View>
      </View>
      <View style={s.photo} />
      <View style={s.body}>
        <SkeletonLine width="45%" height={13} />
        <SkeletonLine width="80%" height={11} />
      </View>
    </View>
  );
}

/** A few cards' worth of placeholder, for the first page of any rating list. */
export function SkeletonFeed({ count = 3 }: { count?: number }) {
  return (
    <View style={s.stack}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRatingCard key={i} />
      ))}
    </View>
  );
}

export function SkeletonRow() {
  return (
    <View style={s.row}>
      <View style={s.avatar} />
      <View style={s.headText}>
        <SkeletonLine width="50%" height={13} />
        <SkeletonLine width="30%" height={11} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  block: { backgroundColor: colors.surfaceAlt },
  stack: { gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  headText: { flex: 1, gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt },
  photo: { height: 170, backgroundColor: colors.surfaceAlt },
  body: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
});
