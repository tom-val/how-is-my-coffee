import { Link } from 'expo-router';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Body, Divider, ScreenHeader, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { goBack } from '@/lib/navigation';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { colors, spacing } from '@/theme';

import { LEGAL_CONTACT, LEGAL_LAST_UPDATED } from './constants';
import { LegalLinks } from './LegalLinks';

/** One rendered block: a paragraph, or a bulleted list. */
export type Block = { p: string } | { bullets: string[] };

/** A titled section of a legal document. */
export type Section = { heading: string; blocks: Block[] };

/** A whole document in one language. Each page ships an English and a Lithuanian one. */
export type LegalDoc = { intro: string; sections: Section[] };

/** English unless the app is in Lithuanian — the same rule the rest of the i18n follows. */
export function usePickLanguage<T>(en: T, lt: T): T {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith('lt') ? lt : en;
}

/**
 * Shared chrome for the public legal pages (/privacy, /terms, /support, /delete-account).
 *
 * They render outside the auth gate on web AND native (see `components/auth-gate.tsx`): App Store
 * and Google Play review open the privacy policy and the account-deletion page from the store
 * listing, before any account exists. They are plain text — no API call, nothing that can fail.
 *
 * The documents live in the route files as data, in both languages, rather than in `en.json` /
 * `lt.json`: they are long prose that is reviewed as a whole, not UI strings.
 */
export function LegalLayout({
  title,
  doc,
  current,
  children,
}: {
  title: string;
  doc: LegalDoc;
  current: 'privacy' | 'terms' | 'support' | 'delete-account';
  /** Rendered after the sections — the delete-account page's "Sign in to delete" button. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { signedIn } = useAuth();

  useDocumentTitle(title);

  return (
    <View style={s.screen}>
      {/* Deep-linked from a store listing there is no history; land a signed-out visitor on the
          sign-in screen rather than bouncing through the private feed. */}
      <ScreenHeader title={title} onBack={() => goBack(signedIn ? '/feed' : '/login')} />

      <Body contentStyle={s.content}>
        <View style={s.head}>
          <Txt variant="caption" tone="faint">
            {t('legal.updated', { date: LEGAL_LAST_UPDATED })}
          </Txt>
          <Txt variant="body" tone="soft">
            {doc.intro}
          </Txt>
        </View>

        {doc.sections.map((sec) => (
          <View key={sec.heading} style={s.section}>
            <Txt variant="section" tone="heading" accessibilityRole="header">
              {sec.heading}
            </Txt>
            {sec.blocks.map((block, i) =>
              'p' in block ? (
                <Txt key={i} variant="body">
                  {block.p}
                </Txt>
              ) : (
                <View key={i} style={s.bullets}>
                  {block.bullets.map((b, j) => (
                    <View key={j} style={s.bulletRow}>
                      <Txt variant="body" tone="soft">
                        •
                      </Txt>
                      <Txt variant="body" style={s.bulletText}>
                        {b}
                      </Txt>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}

        {children}

        <Divider />

        <View style={s.contact}>
          <Txt variant="label" tone="soft">
            {t('legal.contact')}
          </Txt>
          <Link href={`mailto:${LEGAL_CONTACT}`} style={s.mail}>
            <Txt variant="label" tone="primary">
              {LEGAL_CONTACT}
            </Txt>
          </Link>
        </View>

        <LegalLinks current={current} />
      </Body>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { gap: spacing.lg },
  head: { gap: spacing.xs },
  section: { gap: spacing.sm },
  bullets: { gap: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  bulletText: { flex: 1 },
  contact: { alignItems: 'center', gap: spacing.xs },
  mail: { paddingVertical: spacing.xs },
});
