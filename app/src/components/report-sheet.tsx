import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Divider, ErrorText, Sheet, TextField, Txt } from './ui';
import { api, errorCode, errorMessage } from '@/lib/api';
import { showToast } from '@/lib/toast';
import { colors, radius, spacing } from '@/theme';
import type { ReportReason, ReportTargetType } from '@/types';

/** What is being reported. A comment also carries the rating it sits on. */
export type ReportTarget = {
  targetType: ReportTargetType;
  targetId: string;
  ratingId?: string;
};

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'safety.reasonSpam' },
  { value: 'offensive', label: 'safety.reasonOffensive' },
  { value: 'harassment', label: 'safety.reasonHarassment' },
  { value: 'other', label: 'safety.reasonOther' },
];

const TITLES: Record<ReportTargetType, string> = {
  rating: 'safety.reportRating',
  comment: 'safety.reportComment',
  user: 'safety.reportUser',
};

export const REPORT_DETAILS_MAX = 500;

/**
 * Report a rating, a comment or a user (`POST /v1/reports`, App Store 1.2 / Google Play UGC).
 *
 * One reason from a short list, optional details, send. It is the app's keyboard-aware `Sheet`, so
 * the details field lifts clear of the keyboard and the send button stays reachable. Reporting is
 * idempotent server-side, so a double tap or a second report of the same thing is harmless.
 *
 * Open it by passing a `target`; `null` closes it.
 */
export function ReportSheet({
  target,
  onClose,
}: {
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  // Kept past close, so the title does not change while the sheet slides away.
  const [targetType, setTargetType] = useState<ReportTargetType>('rating');

  // Every report starts blank, even when the same target is reopened. Reset while rendering (the
  // React-sanctioned "adjust state when a prop changes"), not in an effect.
  const [shownTarget, setShownTarget] = useState<ReportTarget | null>(null);
  if (target !== shownTarget) {
    setShownTarget(target);
    if (target) {
      setTargetType(target.targetType);
      setReason(null);
      setDetails('');
      setError('');
    }
  }

  const send = useMutation({
    mutationFn: () =>
      api.report({
        targetType: target!.targetType,
        targetId: target!.targetId,
        ratingId: target!.ratingId,
        reason: reason!,
        details: details.trim() || undefined,
      }),
    onSuccess: () => {
      onClose();
      showToast(t('safety.reportThanks'), { duration: 3600 });
    },
    onError: (e) => {
      if (errorCode(e) === 'not_found') {
        // Already removed (by its author or a moderator) — nothing left to report.
        onClose();
        showToast(t('safety.reportGone'));
        return;
      }
      setError(errorMessage(e, t));
    },
  });

  const close = () => {
    if (!send.isPending) onClose();
  };

  return (
    <Sheet
      visible={!!target}
      onClose={close}
      title={t(TITLES[target?.targetType ?? targetType])}
      compact>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        <Txt variant="label" tone="soft">
          {t('safety.reasonTitle')}
        </Txt>

        <View style={s.group} accessibilityRole="radiogroup">
          {REASONS.map((r, i) => {
            const on = reason === r.value;
            return (
              <View key={r.value}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => {
                    setReason(r.value);
                    if (error) setError('');
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={t(r.label)}
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [s.row, pressed && s.pressed]}>
                  <View style={[s.radio, on && s.radioOn]}>
                    {on ? <View style={s.radioDot} /> : null}
                  </View>
                  <Txt variant="headline" style={s.flex}>
                    {t(r.label)}
                  </Txt>
                </Pressable>
              </View>
            );
          })}
        </View>

        <TextField
          label={`${t('safety.details')} (${t('common.optional')})`}
          placeholder={t('safety.detailsPlaceholder')}
          value={details}
          onChangeText={setDetails}
          maxLength={REPORT_DETAILS_MAX}
          multiline
          style={s.details}
          hint={`${details.length}/${REPORT_DETAILS_MAX}`}
          editable={!send.isPending}
        />

        <ErrorText>{error}</ErrorText>

        <Button
          title={t('safety.sendReport')}
          onPress={() => send.mutate()}
          loading={send.isPending}
          disabled={!reason || !target}
        />
        <Button title={t('common.cancel')} variant="quiet" onPress={close} />
      </ScrollView>
    </Sheet>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: spacing.md, paddingBottom: spacing.sm },
  group: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 50,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.primary },
  details: { minHeight: 88, textAlignVertical: 'top' },
});
