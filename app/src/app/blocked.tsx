import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { BlockIcon } from '@/components/icons';
import { SkeletonRow } from '@/components/skeleton';
import { Body, Button, Divider, ScreenHeader, Txt } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { goBack } from '@/lib/navigation';
import { useBlockActions, useBlockList } from '@/lib/useBlocks';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { colors, radius, spacing } from '@/theme';

/**
 * Settings → Blocked users: everyone I have blocked, each with an Unblock button.
 *
 * Blocking happens where the person is (a rating, a comment, their profile); this is the one place
 * to see the whole list and undo it. Unblocking does not bring back follows the block removed.
 */
export default function BlockedUsersScreen() {
  const { t, i18n } = useTranslation();
  const blocks = useBlockList();
  const { askUnblock, unblockingUserId } = useBlockActions();

  useDocumentTitle(t('safety.blockedUsers'));

  const list = blocks.data?.blocks ?? [];

  return (
    <View style={s.screen}>
      <ScreenHeader title={t('safety.blockedUsers')} onBack={() => goBack('/settings')} />
      <Body>
        <Txt variant="label" tone="faint">
          {t('safety.blockedHint')}
        </Txt>

        {blocks.isLoading ? (
          <View style={s.group}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : blocks.isError ? (
          <EmptyState
            title={t('common.somethingWrong')}
            body={errorMessage(blocks.error, t)}
            actionLabel={t('common.retry')}
            onAction={() => void blocks.refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<BlockIcon size={26} color={colors.inkFaint} />}
            title={t('safety.blockedEmptyTitle')}
            body={t('safety.blockedEmptyBody')}
          />
        ) : (
          <View style={s.group}>
            {list.map((b, i) => (
              <View key={b.userId}>
                {i > 0 ? <Divider inset={spacing.lg + 40 + spacing.md} /> : null}
                <UserRow
                  username={b.username}
                  displayName={b.displayName || b.username}
                  subtitle={`@${b.username} · ${t('safety.blockedSince', {
                    date: formatDate(b.blockedAt, i18n.language),
                  })}`}
                  action={
                    <Button
                      title={t('safety.unblock')}
                      size="sm"
                      variant="ghost"
                      loading={unblockingUserId === b.userId}
                      onPress={() => askUnblock({ userId: b.userId, username: b.username })}
                    />
                  }
                />
              </View>
            ))}
          </View>
        )}
      </Body>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
});
