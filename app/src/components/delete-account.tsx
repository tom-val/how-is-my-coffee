import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorText, SectionTitle, Sheet, TextField, Txt } from './ui';
import { api, errorCode, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { showToast } from '@/lib/toast';
import { spacing } from '@/theme';

/**
 * The danger zone at the foot of Settings: in-app account deletion, which App Store guideline
 * 5.1.1(v) and Google Play's account-deletion policy both require.
 *
 * Two deliberate steps. A confirm dialog says what is lost and that it is final; then a sheet asks
 * for the password again (`DELETE /v1/me` re-authenticates, so an unlocked phone or a stolen token
 * alone cannot wipe an account). The sheet is the app's keyboard-aware `Sheet`, which lifts itself
 * clear of the keyboard and hosts its own toast/dialog while open.
 *
 * A wrong password (401 `invalid_credentials`) is shown inline and the sheet stays open — `api.ts`
 * does not treat that 401 as the end of the session. Success ends the session locally only: the
 * server already dropped this account's push tokens, so the usual authenticated push-token DELETE of
 * sign-out would just 401.
 */
export function DeleteAccountSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOutDeleted } = useAuth();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = () =>
    confirmDestructive(
      t('deleteAccount.confirmTitle'),
      t('deleteAccount.confirmBody'),
      t('deleteAccount.continue'),
      () => {
        setPassword('');
        setError('');
        setOpen(true);
      },
    );

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword('');
    setError('');
  };

  const submit = async () => {
    if (busy || password.length === 0) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteAccount(password);
    } catch (e) {
      setError(
        errorCode(e) === 'invalid_credentials' ? t('deleteAccount.wrongPassword') : errorMessage(e, t),
      );
      setBusy(false);
      return;
    }
    // Gone server-side. Close the sheet first so the toast lands on the root host, then drop the
    // session (token, cache, push registration) and leave the private screen we are on.
    setBusy(false);
    setOpen(false);
    setPassword('');
    signOutDeleted();
    router.replace('/login');
    showToast(t('deleteAccount.done'));
  };

  return (
    <View style={s.section}>
      <SectionTitle>{t('deleteAccount.dangerZone')}</SectionTitle>
      <Txt variant="label" tone="faint">
        {t('deleteAccount.hint')}
      </Txt>
      <Button title={t('deleteAccount.title')} variant="danger" onPress={start} />

      <Sheet visible={open} onClose={close} title={t('deleteAccount.passwordTitle')} compact>
        <View style={s.sheetBody}>
          <Txt variant="body" tone="soft">
            {t('deleteAccount.passwordBody')}
          </Txt>
          <TextField
            label={t('auth.password')}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (error) setError('');
            }}
            secureTextEntry
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            editable={!busy}
          />
          <ErrorText>{error}</ErrorText>
          <Button
            title={t('deleteAccount.submit')}
            variant="danger"
            onPress={() => void submit()}
            loading={busy}
            disabled={password.length === 0}
          />
          <Button title={t('common.cancel')} variant="quiet" onPress={close} disabled={busy} />
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.lg },
  sheetBody: { gap: spacing.md },
});
