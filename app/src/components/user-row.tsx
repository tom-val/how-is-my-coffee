import { useRouter } from 'expo-router';
import type React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from './avatar';
import { Txt } from './ui';
import { spacing } from '@/theme';

/**
 * One person in a list — following, followers, likes, search results. Tapping the row opens their
 * public profile; whatever action the list needs (Follow, Unfollow) goes in `action`, outside the
 * row's own press target so the two never fight.
 */
export function UserRow({
  username,
  displayName,
  subtitle,
  action,
}: {
  username: string;
  displayName: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={s.row}>
      <Pressable
        onPress={() => router.push(`/u/${username}`)}
        accessibilityRole="button"
        accessibilityLabel={displayName}
        style={({ pressed }) => [s.main, pressed && s.pressed]}>
        <Avatar name={displayName} seed={username} size={40} />
        <View style={s.text}>
          <Txt variant="headline" numberOfLines={1}>
            {displayName}
          </Txt>
          <Txt variant="caption" tone="faint" numberOfLines={1}>
            {subtitle ?? `@${username}`}
          </Txt>
        </View>
      </Pressable>
      {action}
    </View>
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
    minHeight: 64,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1 },
});
