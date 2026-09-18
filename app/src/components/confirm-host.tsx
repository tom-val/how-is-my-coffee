import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { registerDialogHost, resolveDialog, type DialogRequest } from '@/lib/confirm';
import { colors, fonts, radius, spacing, type } from '@/theme';

/**
 * Host for the app's confirm/notify dialogs (see `lib/confirm.ts`) — one branded dialog on web,
 * iOS and Android, where RN's own `Alert` silently no-ops on web.
 *
 * Mounted at the root and again, with `scoped`, inside every overlay presenting its own `Modal`.
 * A scoped host draws the dialog as an absolute-fill overlay rather than a nested `Modal`: it is
 * already inside a full-screen modal, so there is no second modal to mis-order.
 */
export function ConfirmHost({ scoped = false }: { scoped?: boolean }) {
  const { t } = useTranslation();
  const [req, setReq] = useState<DialogRequest | null>(null);

  useEffect(() => registerDialogHost(setReq, scoped), [scoped]);

  // Web: Enter confirms, Escape dismisses. Only the topmost host holds a request, so only it binds.
  useEffect(() => {
    if (Platform.OS !== 'web' || !req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        resolveDialog(req);
        req.onConfirm?.();
      } else if (e.key === 'Escape') {
        resolveDialog(req);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;

  const close = () => resolveDialog(req);
  const confirm = () => {
    close();
    req.onConfirm?.();
  };

  const dialog = (
    /* Backdrop press cancels a confirm; a notification just dismisses. */
    <Pressable style={s.backdrop} onPress={close} accessible={false}>
      <Pressable style={s.card} onPress={() => {}} accessible={false}>
        <Text style={s.title}>{req.title}</Text>
        {req.message ? <Text style={s.message}>{req.message}</Text> : null}

        <View style={s.actions}>
          {req.cancelable ? (
            <Pressable
              onPress={close}
              style={({ pressed }) => [s.btn, s.neutral, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}>
              <Text style={s.neutralText}>{t('common.cancel')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={confirm}
            style={({ pressed }) => [
              s.btn,
              req.destructive ? s.destructive : s.primary,
              pressed && s.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={req.confirmLabel || t('common.ok')}>
            <Text style={req.destructive ? s.destructiveText : s.primaryText}>
              {req.confirmLabel || t('common.ok')}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );

  if (scoped) return <View style={StyleSheet.absoluteFill}>{dialog}</View>;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      {dialog}
    </Modal>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { ...type.section, color: colors.heading },
  message: { ...type.body, color: colors.inkSoft },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    minWidth: 92,
    alignItems: 'center',
  },
  neutral: { backgroundColor: colors.surfaceAlt },
  neutralText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkSoft },
  primary: { backgroundColor: colors.primary },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.primaryInk },
  destructive: { backgroundColor: colors.bad },
  // `bad` is a light salmon in dark mode, so white-on-red would invert to unreadable — `surface`
  // is white in light and near-black in dark, i.e. always the readable label on a `bad` fill.
  destructiveText: { fontFamily: fonts.bold, fontSize: 15, color: colors.surface },
});
