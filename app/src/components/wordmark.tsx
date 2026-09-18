import { StyleSheet, View } from 'react-native';

import { CupIcon } from './icons';
import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

/**
 * The app's name, set in Fraunces under its cup — the tall, centred version, for the auth screens
 * where the name IS the page. The signed-in app shows the same mark laid out as a compact strip at
 * the top of every tab; that one is `brand-header.tsx`.
 */
export function Wordmark({ tagline }: { tagline?: string }) {
  return (
    <View style={s.wrap}>
      <View style={s.badge}>
        <CupIcon size={30} color={colors.primary} />
      </View>
      <Txt variant="display" tone="heading">
        Kavutė
      </Txt>
      {tagline ? (
        <Txt variant="body" tone="soft">
          {tagline}
        </Txt>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
