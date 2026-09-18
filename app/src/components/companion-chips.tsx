import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Chip } from './ui';
import type { Companion } from '@/types';

/**
 * "Who drank coffee with me" as a row of chips.
 *
 * A companion is either a registered user or a guest name the author typed. Registered ones are
 * tappable and open that person's public profile; guests are inert, and look it — same pill, no
 * press feedback — so the difference is visible before you tap rather than after.
 */
export function CompanionChips({ companions }: { companions: Companion[] }) {
  const router = useRouter();
  if (!companions.length) return null;

  return (
    <View style={s.row}>
      {companions.map((c, i) => {
        const key = c.userId ?? `${c.displayName}-${i}`;
        if (!c.username) return <Chip key={key} label={c.displayName} tone="accent" />;
        return (
          <Chip
            key={key}
            label={c.displayName}
            tone="accent"
            accessibilityLabel={`@${c.username}`}
            onPress={() => router.push(`/u/${c.username}`)}
          />
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
