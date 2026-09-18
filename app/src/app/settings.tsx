import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import {
  Body,
  Button,
  Divider,
  ErrorText,
  ScreenHeader,
  SectionTitle,
  SegmentedRow,
  Txt,
} from '@/components/ui';
import { setLanguage, SUPPORTED, type Lang } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import { isPushBlocked } from '@/lib/push';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import {
  APPEARANCE_PREFERENCES,
  colors,
  radius,
  setAppearancePreference,
  spacing,
  useAppearancePreference,
  useColors,
  type AppearancePreference,
} from '@/theme';
import type { NotificationPrefs } from '@/types';

/**
 * Preferences and the way out. Reached from the gear on the Profile tab, which is now free to be
 * about the person rather than about the app.
 *
 * There is not much here, and that is the point: two preferences, what this build is, and sign out.
 * Anything that belongs to the account (the name, the caffeine, the ratings) stays on the profile.
 */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const appearance = useAppearancePreference();

  useDocumentTitle(t('settings.title'));

  // Only iOS and web can repaint live; on Android a view resolves its colour once, so the choice is
  // stored and applied on the next start (see `theme/appearance`).
  const changeAppearance = async (value: AppearancePreference) => {
    const outcome = await setAppearancePreference(value);
    if (outcome === 'restart-required') showToast(t('settings.appearanceRestart'));
  };

  const version = Constants.expoConfig?.version ?? '—';

  return (
    <View style={s.screen}>
      {/* `goBack`, not `router.back`: /settings is a deep-linkable web URL and can be opened with
          no history behind it. */}
      <ScreenHeader title={t('settings.title')} onBack={() => goBack()} />

      <Body>
        <View style={s.section}>
          <SectionTitle>{t('settings.language')}</SectionTitle>
          <SegmentedRow<Lang>
            value={(SUPPORTED.find((l) => i18n.language.startsWith(l)) ?? 'en') as Lang}
            onChange={(lang) => void setLanguage(lang)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'lt', label: 'Lietuvių' },
            ]}
          />
        </View>

        <View style={s.section}>
          <SectionTitle>{t('settings.appearance')}</SectionTitle>
          <SegmentedRow<AppearancePreference>
            value={appearance}
            onChange={(value) => void changeAppearance(value)}
            options={APPEARANCE_PREFERENCES.map((value) => ({
              value,
              label: t(
                value === 'system'
                  ? 'settings.appearanceSystem'
                  : value === 'light'
                    ? 'settings.appearanceLight'
                    : 'settings.appearanceDark',
              ),
            }))}
          />
        </View>

        <NotificationsSection />

        <View style={s.section}>
          <SectionTitle>{t('settings.about')}</SectionTitle>
          <View style={s.card}>
            <View style={s.row}>
              <Txt variant="label" tone="soft">
                {t('app.name')}
              </Txt>
              <Txt variant="label" tone="faint" numberOfLines={1} style={s.value}>
                {t('app.tagline')}
              </Txt>
            </View>
            <Divider />
            <View style={s.row}>
              <Txt variant="label" tone="soft">
                {t('settings.version')}
              </Txt>
              <Txt variant="label" tone="faint" style={s.value}>
                {version}
              </Txt>
            </View>
          </View>
        </View>

        <Button
          title={t('auth.signOut')}
          variant="danger"
          onPress={() =>
            confirmDestructive(t('auth.signOutConfirm'), undefined, t('auth.signOut'), signOut)
          }
        />
      </Body>
    </View>
  );
}

/** The five push types, in the order they appear on screen. Keys match the contract's DTO. */
const NOTIFICATION_TYPES = [
  { key: 'tagged', label: 'settings.notifyTagged' },
  { key: 'like', label: 'settings.notifyLike' },
  { key: 'comment', label: 'settings.notifyComment' },
  { key: 'follow', label: 'settings.notifyFollow' },
  { key: 'friendRating', label: 'settings.notifyFriendRating' },
] as const satisfies readonly { key: keyof NotificationPrefs; label: string }[];

/** True when the OS permission was denied and cannot be asked for again in-app. Re-checked every
 *  time the app comes back to the foreground, which is how the user returns from system settings. */
function usePushBlocked(): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void isPushBlocked().then((value) => {
        if (!cancelled) setBlocked(value);
      });
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return blocked;
}

/**
 * Which notifications this account wants. The prefs live on the server, not on the device, so they
 * follow the user to a new phone — and they are meaningful on web too, where this build can never
 * receive a push itself but the user's phone can.
 *
 * Each switch writes immediately and optimistically: a toggle that waited for a round trip would
 * sit there half-flipped, and there is nothing to "save".
 */
function NotificationsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const c = useColors(); // <Switch> wants real colour strings, not platform/CSS colours
  const blocked = usePushBlocked();

  const prefs = useQuery({
    queryKey: qk.notificationPrefs(),
    queryFn: () => api.getNotificationPrefs(),
  });

  const update = useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) => api.updateNotificationPrefs(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: qk.notificationPrefs() });
      const previous = queryClient.getQueryData<NotificationPrefs>(qk.notificationPrefs());
      if (previous) queryClient.setQueryData(qk.notificationPrefs(), { ...previous, ...patch });
      return { previous };
    },
    onError: (error, _patch, context) => {
      // Put the switch back where the user found it and say why.
      if (context?.previous) queryClient.setQueryData(qk.notificationPrefs(), context.previous);
      showToast(errorMessage(error, t));
    },
    // The response is the full set — cheaper and more truthful than invalidating.
    onSuccess: (fresh) => queryClient.setQueryData(qk.notificationPrefs(), fresh),
  });

  const toggle = useCallback(
    (key: keyof NotificationPrefs, value: boolean) => update.mutate({ [key]: value }),
    [update],
  );

  const data = prefs.data;

  return (
    <View style={s.section}>
      <SectionTitle>{t('settings.notifications')}</SectionTitle>

      {Platform.OS === 'web' ? (
        <Txt variant="label" tone="faint">
          {t('settings.notificationsWebOnly')}
        </Txt>
      ) : blocked ? (
        <View style={s.notice}>
          <Txt variant="label" tone="faint">
            {t('settings.notificationsBlocked')}
          </Txt>
          <Pressable
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            style={({ pressed }) => pressed && s.pressed}>
            <Txt variant="label" tone="primary">
              {t('settings.notificationsOpenSettings')}
            </Txt>
          </Pressable>
        </View>
      ) : null}

      <View style={s.card}>
        {NOTIFICATION_TYPES.map((item, index) => {
          // Until the prefs land, every switch shows its default (on) and is inert, so the section
          // never flickers between an empty box and five rows.
          const on = data ? data[item.key] : true;
          return (
            <View key={item.key}>
              {index > 0 ? <Divider /> : null}
              <View style={s.row}>
                <Txt variant="label" tone="soft" style={s.rowLabel}>
                  {t(item.label)}
                </Txt>
                <Switch
                  value={on}
                  onValueChange={(next) => toggle(item.key, next)}
                  disabled={!data}
                  accessibilityLabel={t(item.label)}
                  trackColor={{ false: c.line, true: c.primary }}
                  // iOS draws its own white thumb and ignores the prop; Android and web default to
                  // a Material green that has nothing to do with this app.
                  thumbColor={Platform.OS === 'ios' ? undefined : on ? c.primaryInk : c.inkFaint}
                  ios_backgroundColor={c.line}
                  // react-native-web ignores `trackColor`/`thumbColor` for the ON state and paints
                  // its own Material teal unless these web-only props are given.
                  {...(Platform.OS === 'web'
                    ? ({ activeTrackColor: c.primary, activeThumbColor: c.primaryInk } as object)
                    : {})}
                />
              </View>
            </View>
          );
        })}
      </View>

      {prefs.isError ? <ErrorText>{errorMessage(prefs.error, t)}</ErrorText> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pressed: { opacity: 0.68 },
  notice: { gap: spacing.xs },
  rowLabel: { flexShrink: 1 },
  section: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  value: { flexShrink: 1, textAlign: 'right' },
});
