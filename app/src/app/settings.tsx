import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Body, Button, Divider, ScreenHeader, SectionTitle, SegmentedRow, Txt } from '@/components/ui';
import { setLanguage, SUPPORTED, type Lang } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import { showToast } from '@/lib/toast';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import {
  APPEARANCE_PREFERENCES,
  colors,
  radius,
  setAppearancePreference,
  spacing,
  useAppearancePreference,
  type AppearancePreference,
} from '@/theme';

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

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
