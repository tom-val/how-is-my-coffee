import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/wordmark';
import { Body, Button, ErrorText, TextField, Txt } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/theme';

/** The API's own rule, mirrored here so a bad handle is caught before the round trip. */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const usernameValid = USERNAME_RE.test(username.trim());
  const canSubmit = usernameValid && displayName.trim().length > 0 && password.length >= 6;

  const submit = async () => {
    if (busy || !canSubmit) return;
    setError('');
    setBusy(true);
    try {
      await signUp(username, displayName, password);
      router.replace('/feed');
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Body contentStyle={s.content}>
        <Wordmark />

        <View style={s.form}>
          <Txt variant="title" tone="heading" style={s.centre}>
            {t('auth.createTitle')}
          </Txt>
          <Txt variant="body" tone="soft" style={s.centre}>
            {t('auth.createSubtitle')}
          </Txt>

          <TextField
            label={t('auth.username')}
            hint={t('auth.usernameHint')}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            error={username.length > 0 && !usernameValid ? t('auth.usernameHint') : undefined}
          />
          <TextField
            label={t('auth.displayName')}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            maxLength={50}
          />
          <TextField
            label={t('auth.password')}
            hint={t('auth.passwordHint')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <ErrorText>{error}</ErrorText>

          <Button
            title={t('auth.signUp')}
            onPress={submit}
            loading={busy}
            disabled={!canSubmit}
          />

          <Link href="/login" style={s.link}>
            <Txt variant="label" tone="primary">
              {t('auth.haveAccount')}
            </Txt>
          </Link>
        </View>
      </Body>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { gap: spacing.xl, paddingTop: spacing.xl, justifyContent: 'center', flexGrow: 1 },
  form: { gap: spacing.lg },
  centre: { textAlign: 'center' },
  link: { alignSelf: 'center', paddingVertical: spacing.sm },
});
