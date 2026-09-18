import { useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Txt } from './ui';
import { missingConfig } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { colors, spacing } from '@/theme';

/**
 * Keeps the URL and the session in agreement.
 *
 * Two rules, and no more: a signed-out user on a private route goes to `/login`, and a signed-in
 * user sitting on `/login` or `/register` goes to the feed. Everything else — which tab, which
 * rating — is the router's business.
 *
 * `/u/<username>` is deliberately public: a profile link shared with someone who has no account
 * must open, or the link is worthless. The API serves those two endpoints unauthenticated.
 */
const PUBLIC_SEGMENTS = new Set(['login', 'register', 'u', '+not-found']);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { signedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { t } = useTranslation();

  const top = segments[0] as string | undefined;
  const onPublicRoute = top !== undefined && PUBLIC_SEGMENTS.has(top);
  const onAuthRoute = top === 'login' || top === 'register';

  useEffect(() => {
    if (!signedIn && !onPublicRoute) {
      router.replace('/login');
    } else if (signedIn && onAuthRoute) {
      router.replace('/feed');
    }
  }, [signedIn, onPublicRoute, onAuthRoute, router]);

  // A release build with no API address cannot do anything useful; say so instead of failing every
  // request with a confusing network error.
  if (missingConfig.length > 0) {
    return (
      <View style={s.centre}>
        <Txt variant="section" tone="heading">
          {t('common.somethingWrong')}
        </Txt>
        <Txt variant="body" tone="soft" style={s.text}>
          {t('errors.configMissing')}
        </Txt>
      </View>
    );
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  text: { textAlign: 'center' },
});
