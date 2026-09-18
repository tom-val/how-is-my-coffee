import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { registerToastHost, type ToastRequest } from '@/lib/toast';
import { colors, fonts, maxContentWidth, radius, shadows, spacing } from '@/theme';

/** Clears the bottom tab bar so the pill never covers it. */
const BOTTOM_CLEARANCE = 72;

/**
 * Host for the app's toasts (see `lib/toast.ts`) — a pill near the bottom that sits for a moment
 * and goes away. Mounted at the root, and again with `scoped` inside every overlay that presents
 * its own `Modal` (see the comment in `lib/toast.ts` for why).
 *
 * `pointerEvents="none"` throughout: a toast is a notice, never a target, and must not eat a tap
 * meant for the screen underneath.
 */
export function ToastHost({ scoped = false }: { scoped?: boolean }) {
  const [toast, setToast] = useState<ToastRequest | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => registerToastHost(setToast, scoped), [scoped]);

  if (!toast) return null;

  return (
    <View
      pointerEvents="none"
      style={[s.wrap, { paddingBottom: insets.bottom + BOTTOM_CLEARANCE }]}>
      <View style={s.pill} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={s.text}>{toast.message}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
  },
  // Inverted: `ink` on `bg` is the body-text pairing, so swapping them reads as a deliberate
  // floating notice and stays legible in both schemes.
  pill: {
    maxWidth: maxContentWidth - spacing.xl,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    boxShadow: shadows.raised,
  },
  text: { color: colors.bg, fontSize: 14, fontFamily: fonts.medium, textAlign: 'center' },
});
