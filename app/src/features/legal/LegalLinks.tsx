import { Link, type Href } from 'expo-router';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui';
import { spacing } from '@/theme';

type LegalPage = 'privacy' | 'terms' | 'support' | 'delete-account';

const PAGES: { page: LegalPage; href: Href; label: string }[] = [
  { page: 'privacy', href: '/privacy', label: 'legal.privacy' },
  { page: 'terms', href: '/terms', label: 'legal.terms' },
  { page: 'support', href: '/support', label: 'legal.support' },
];

/**
 * "Privacy policy · Terms · Support" — the small muted row under the sign-in and sign-up forms and
 * at the foot of every legal page. Store review wants these reachable before any account exists.
 * `current` leaves out the page the row sits on.
 */
export function LegalLinks({ current }: { current?: LegalPage }) {
  const { t } = useTranslation();
  const pages = PAGES.filter((p) => p.page !== current);
  return (
    <View style={s.row}>
      {pages.map((p, i) => (
        <Fragment key={p.page}>
          {i > 0 ? (
            <Txt variant="caption" tone="faint">
              ·
            </Txt>
          ) : null}
          <Link href={p.href} style={s.link}>
            <Txt variant="caption" tone="soft">
              {t(p.label)}
            </Txt>
          </Link>
        </Fragment>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  link: { paddingVertical: spacing.xs },
});
