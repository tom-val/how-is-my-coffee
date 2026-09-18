import { StyleSheet, View } from 'react-native';

import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

/**
 * Today's and all-time caffeine, side by side.
 *
 * Deliberately two plain numbers and no gauge or daily-limit bar: the app records what you drank,
 * it does not have an opinion about it, and a red "over your limit" ring would be medical advice
 * this app is in no position to give.
 */
export function CaffeineStats({
  todayMg,
  totalMg,
  todayLabel,
  totalLabel,
  unit,
}: {
  todayMg: number;
  totalMg: number;
  todayLabel: string;
  totalLabel: string;
  unit: string;
}) {
  return (
    <View style={s.wrap}>
      <Stat label={todayLabel} value={todayMg} unit={unit} highlight />
      <View style={s.split} />
      <Stat label={totalLabel} value={totalMg} unit={unit} />
    </View>
  );
}

function Stat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <View style={s.stat}>
      <Txt variant="caption" tone="faint">
        {label}
      </Txt>
      <View style={s.valueRow}>
        <Txt variant="display" tone={highlight ? 'heading' : 'ink'}>
          {value.toLocaleString()}
        </Txt>
        <Txt variant="label" tone="faint" style={s.unit}>
          {unit}
        </Txt>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    paddingVertical: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  unit: { marginBottom: 2 },
  split: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 4 },
});
