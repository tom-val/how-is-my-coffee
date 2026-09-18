import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/wordmark';
import { Body, Button, ErrorText, TextField, Txt } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await signIn(username, password);
      router.replace('/feed');
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = username.trim().length >= 3 && password.length >= 6;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Body contentStyle={s.content}>
          <Wordmark tagline={t('app.tagline')} />

          <View style={s.form}>
            <Txt variant="title" tone="heading" style={s.centre}>
              {t('auth.welcomeBack')}
            </Txt>

            <TextField
              label={t('auth.username')}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
            />
            <TextField
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            <ErrorText>{error}</ErrorText>

            <Button
              title={t('auth.signIn')}
              onPress={submit}
              loading={busy}
              disabled={!canSubmit}
            />

            <Link href="/register" style={s.link}>
              <Txt variant="label" tone="primary">
                {t('auth.noAccount')}
              </Txt>
            </Link>
          </View>
        </Body>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { gap: spacing.xl, paddingTop: spacing.xxl, justifyContent: 'center', flexGrow: 1 },
  form: { gap: spacing.lg },
  centre: { textAlign: 'center' },
  link: { alignSelf: 'center', paddingVertical: spacing.sm },
});
