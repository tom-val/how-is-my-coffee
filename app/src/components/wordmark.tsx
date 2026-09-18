import { StyleSheet, View } from 'react-native';

import { CupIcon } from './icons';
import { Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

/**
 * The app's name, set in Fraunces next to its cup. Used on the auth screens and nowhere else — the
 * signed-in app never needs to tell you which app you are in.
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
