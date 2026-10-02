import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Divider, Sheet, Txt } from './ui';
import { colors, radius, spacing } from '@/theme';

export type MenuAction = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

/**
 * A short list of actions in a bottom sheet — the "⋯" menu on ratings, comments and profiles.
 *
 * Our own `Sheet` rather than `ActionSheetIOS` / a platform menu, so it looks and works the same on
 * web, iOS and Android.
 *
 * The chosen action runs only once the menu is gone: on iOS, presenting the next modal (the report
 * sheet, the block confirmation) while this one is still sliding away would fail silently. iOS
 * reports that moment through `onDismiss`; Android and web need no wait. A timer backs `onDismiss`
 * up in case it never fires.
 */
export function ActionMenu({
  visible,
  onClose,
  title,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  actions: MenuAction[];
}) {
  const pending = useRef<(() => void) | null>(null);

  const runPending = useCallback(() => {
    const run = pending.current;
    pending.current = null;
    run?.();
  }, []);

  useEffect(() => {
    if (visible || !pending.current) return;
    if (Platform.OS !== 'ios') {
      runPending();
      return;
    }
    const fallback = setTimeout(runPending, 700);
    return () => clearTimeout(fallback);
  }, [visible, runPending]);

  const select = (action: MenuAction) => {
    pending.current = action.onSelect;
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      compact
      onDismiss={Platform.OS === 'ios' ? runPending : undefined}>
      <View style={s.group}>
        {actions.map((action, i) => (
          <View key={action.key}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => select(action)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={({ pressed }) => [s.row, pressed && s.pressed]}>
              {action.icon ? <View style={s.icon}>{action.icon}</View> : null}
              <Txt
                variant="headline"
                tone={action.destructive ? 'bad' : 'ink'}
                numberOfLines={1}
                style={s.label}>
                {action.label}
              </Txt>
            </Pressable>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.6 },
  group: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  icon: { width: 22, alignItems: 'center' },
  label: { flex: 1 },
});
