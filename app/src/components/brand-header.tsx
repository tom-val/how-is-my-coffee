import type React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { CupIcon } from './icons';
import { Txt } from './ui';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { colors, fonts, spacing } from '@/theme';

/**
 * The strip at the top of every tab: the cup and the name on the left, the screen you are on
 * right-aligned and quiet, and whatever that screen needs as an action after it.
 *
 * One row rather than two, and the screen's own large heading goes away with it — the name and the
 * page title stacked as two Fraunces lines fought each other, and the four tabs each carried a
 * differently-shaped heading. This gives all of them the same chrome and hands the space back to
 * the content, which on the Places tab is a map.
 *
 * It does not claim the safe area itself: every tab screen already sits in a
 * `SafeAreaView edges={['top']}`, and this is the first thing inside it.
 *
 * On the web it also owns the browser tab's title — see `lib/useDocumentTitle`.
 */
export function BrandHeader({
  title,
  right,
}: {
  title: string;
  /** Trailing action for this tab — the gear on Profile. Keep it to one icon button. */
  right?: React.ReactNode;
}) {
  const { t } = useTranslation();
  useDocumentTitle(title);

  return (
    <View style={s.wrap}>
      <View style={s.brand}>
        <CupIcon size={20} color={colors.primary} />
        <Text style={s.name} accessibilityRole="header">
          {t('app.name')}
        </Text>
      </View>
      <Txt variant="label" tone="faint" numberOfLines={1} style={s.title}>
        {title}
      </Txt>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    // The action is 36 pt tall; a fixed minimum keeps the strip the same height on every tab,
    // whether or not that tab has one.
    minHeight: 48,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  // The one place a font size is spelled out rather than taken from `type`: this sits between
  // `section` (17) and `title` (22) on purpose, so it reads as a mark and not as a heading.
  name: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.heading },
  title: { flex: 1, textAlign: 'right' },
});
