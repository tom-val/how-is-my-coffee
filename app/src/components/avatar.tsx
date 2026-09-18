import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

/**
 * A circular initial badge. There are no profile photos in this app — the account is a username and
 * a display name — so the "avatar" is the first letter on a tint derived from the name, which gives
 * each person a stable colour without anyone uploading anything.
 */
const TINTS = [
  { bg: colors.primarySoft, ink: colors.primary },
  { bg: colors.amberSoft, ink: colors.warn },
  { bg: colors.goodSoft, ink: colors.good },
  { bg: colors.badSoft, ink: colors.bad },
  { bg: colors.surfaceAlt, ink: colors.inkSoft },
] as const;

function tintFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function Avatar({
  name,
  seed,
  size = 40,
}: {
  /** Shown as an initial. */
  name?: string | null;
  /** What the colour is derived from — pass the username so it survives a display-name change. */
  seed?: string | null;
  size?: number;
}) {
  const tint = tintFor(seed ?? name ?? '?');
  const initial = (name ?? '?').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <View
      accessible={false}
      style={[
        s.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tint.bg },
      ]}>
      <Text style={[s.text, { fontSize: size * 0.42, color: tint.ink }]}>{initial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.heading },
});
