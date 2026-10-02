import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionMenu, type MenuAction } from './action-menu';
import { BlockIcon, FlagIcon, MoreIcon } from './icons';
import { ReportSheet, type ReportTarget } from './report-sheet';
import { IconButton } from './ui';
import { useBlockActions } from '@/lib/useBlocks';
import { colors } from '@/theme';

/**
 * Someone else's content (or account) the "⋯" menu acts on. `userId` / `username` are its author.
 * Never built for the signed-in user's own content — the menu is not offered there.
 */
export type SafetySubject =
  | { kind: 'rating'; ratingId: string; userId: string; username: string }
  | { kind: 'comment'; ratingId: string; commentId: string; userId: string; username: string }
  | { kind: 'user'; userId: string; username: string; blocked?: boolean };

function reportTarget(subject: SafetySubject): ReportTarget {
  switch (subject.kind) {
    case 'rating':
      return { targetType: 'rating', targetId: subject.ratingId };
    case 'comment':
      return { targetType: 'comment', targetId: subject.commentId, ratingId: subject.ratingId };
    case 'user':
      return { targetType: 'user', targetId: subject.userId };
  }
}

/**
 * Report and block, wired once: `open(subject)` shows the menu, `element` must be rendered by the
 * screen (it holds the menu sheet and the report sheet). One per screen or list — never one per
 * card, which would mount two modals for every coffee in the feed.
 *
 * `onBlocked` runs after a confirmed block — the rating detail uses it to leave a rating whose
 * author was just blocked.
 */
export function useSafetyMenu(opts?: { onBlocked?: (subject: SafetySubject) => void }) {
  const { t } = useTranslation();
  const { askBlock, askUnblock } = useBlockActions();

  const [subject, setSubject] = useState<SafetySubject | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);

  const onBlocked = opts?.onBlocked;

  const actions: MenuAction[] = [];
  if (subject) {
    const reportLabel =
      subject.kind === 'rating'
        ? t('safety.reportRating')
        : subject.kind === 'comment'
          ? t('safety.reportComment')
          : t('safety.reportUser');
    actions.push({
      key: 'report',
      label: reportLabel,
      icon: <FlagIcon size={20} color={colors.inkSoft} />,
      onSelect: () => setReport(reportTarget(subject)),
    });
    if (subject.kind === 'user' && subject.blocked) {
      actions.push({
        key: 'unblock',
        label: t('safety.unblockUser'),
        icon: <BlockIcon size={20} color={colors.inkSoft} />,
        onSelect: () => askUnblock({ userId: subject.userId, username: subject.username }),
      });
    } else {
      actions.push({
        key: 'block',
        label:
          subject.kind === 'user'
            ? t('safety.blockUser')
            : t('safety.blockUsername', { username: subject.username }),
        icon: <BlockIcon size={20} color={colors.bad} />,
        destructive: true,
        onSelect: () =>
          askBlock({ username: subject.username, userId: subject.userId }, () =>
            onBlocked?.(subject),
          ),
      });
    }
  }

  const element = (
    <>
      <ActionMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={subject ? `@${subject.username}` : t('safety.moreActions')}
        actions={actions}
      />
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </>
  );

  const open = (next: SafetySubject) => {
    setSubject(next);
    setMenuOpen(true);
  };

  return { open, element };
}

/** The small "⋯" that opens the menu. */
export function MoreButton({
  onPress,
  tone = 'plain',
  size = 20,
}: {
  onPress: () => void;
  tone?: 'plain' | 'soft';
  size?: number;
}) {
  const { t } = useTranslation();
  return (
    <IconButton onPress={onPress} accessibilityLabel={t('safety.moreActions')} tone={tone}>
      <MoreIcon size={size} color={colors.inkFaint} />
    </IconButton>
  );
}
