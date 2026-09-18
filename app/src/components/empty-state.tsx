import type React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

/**
 * What a list says when it has nothing in it — a real sentence and, where there is one, the action
 * that fixes it. Never a bare "No data": an empty feed on a new account is the normal first screen,
 * so it has to read like a welcome rather than a failure.
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.wrap}>
      {icon ? <View style={s.icon}>{icon}</View> : null}
      <Txt variant="section" tone="heading" style={s.centre}>
        {title}
      </Txt>
      {body ? (
        <Txt variant="body" tone="soft" style={s.centre}>
          {body}
        </Txt>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="ghost" size="sm" />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  centre: { textAlign: 'center' },
});
