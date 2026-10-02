import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { BlockIcon, PinIcon } from '@/components/icons';
import { PlaceRow } from '@/components/place-row';
import { RatingList } from '@/components/rating-list';
import { MoreButton, useSafetyMenu } from '@/components/safety-menu';
import { Button, Divider, ScreenHeader, SegmentedRow, Txt } from '@/components/ui';
import { api, errorMessage, PAGE_SIZE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBlockActions, useBlockList } from '@/lib/useBlocks';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { colors, radius, spacing } from '@/theme';
import { goBack } from '@/lib/navigation';

type Section = 'ratings' | 'places';

/**
 * Somebody else's profile, and the app's one public page: it renders signed-out, because a link to
 * a coffee you rated has to open for the friend you sent it to before they have an account.
 * The API serves the two endpoints behind it unauthenticated (and returns no likes, which is why
 * the hearts are inert here for a signed-out visitor).
 *
 * Signed in, on someone else's profile, the header's "⋯" reports or blocks them. Once blocked, the
 * profile says so and offers Unblock instead of their coffees — the API may answer their profile
 * with a 404 by then, so the blocked state comes from my own block list, not from the profile.
 */
export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { t, i18n } = useTranslation();
  const { me } = useAuth();

  const [section, setSection] = useState<Section>('ratings');

  const isMe = !!me && me.username === username?.toLowerCase();
  const blockList = useBlockList(!!me && !isMe);
  const block = blockList.data?.blocks.find(
    (b) => b.username.toLowerCase() === username?.toLowerCase(),
  );
  const { askUnblock, unblocking } = useBlockActions();
  const safety = useSafetyMenu();

  const user = useQuery({
    queryKey: qk.user(username),
    queryFn: () => api.user(username),
    enabled: !!username,
  });

  const places = useQuery({
    queryKey: qk.userPlaces(username),
    queryFn: () => api.userPlaces(username),
    enabled: !!username && section === 'places' && !block,
  });

  const userId = user.data?.userId ?? block?.userId;
  const menuButton =
    me && !isMe && userId ? (
      <MoreButton
        tone="soft"
        onPress={() =>
          safety.open({ kind: 'user', userId, username: block?.username ?? username, blocked: !!block })
        }
      />
    ) : null;

  if (block) {
    return (
      <View style={s.screen}>
        <ScreenHeader
          title={block.displayName || `@${block.username}`}
          onBack={() => goBack()}
          right={menuButton}
        />
        <EmptyState
          icon={<BlockIcon size={26} color={colors.inkFaint} />}
          title={t('safety.youBlocked', { username: block.username })}
          body={t('safety.youBlockedBody')}
        />
        <View style={s.unblock}>
          <Button
            title={t('safety.unblock')}
            variant="ghost"
            loading={unblocking}
            onPress={() => askUnblock({ userId: block.userId, username: block.username })}
          />
        </View>
        {safety.element}
      </View>
    );
  }

  if (user.isError) {
    return (
      <View style={s.screen}>
        <ScreenHeader title={`@${username}`} onBack={() => goBack()} />
        <EmptyState
          title={t('profile.notFound')}
          body={errorMessage(user.error, t)}
          actionLabel={t('common.retry')}
          onAction={() => void user.refetch()}
        />
      </View>
    );
  }

  const header = (
    <View style={s.header}>
      <View style={s.identity}>
        <Avatar name={user.data?.displayName ?? username} seed={username} size={56} />
        <View style={s.flex}>
          <Txt variant="title" tone="heading" numberOfLines={1}>
            {user.data?.displayName ?? `@${username}`}
          </Txt>
          <Txt variant="label" tone="faint">
            @{username}
          </Txt>
          {user.data ? (
            <Txt variant="caption" tone="faint">
              {t('profile.memberSince', { date: formatDate(user.data.createdAt, i18n.language) })}
            </Txt>
          ) : null}
        </View>
      </View>

      <SegmentedRow<Section>
        value={section}
        onChange={setSection}
        options={[
          { value: 'ratings', label: t('profile.myRatings') },
          { value: 'places', label: t('profile.myPlaces') },
        ]}
      />

      {section === 'places' ? (
        (places.data?.places ?? []).length === 0 ? (
          <EmptyState
            icon={<PinIcon size={26} color={colors.inkFaint} />}
            title={t('places.emptyTitle')}
          />
        ) : (
          <View style={s.group}>
            {[...(places.data?.places ?? [])]
              .sort((a, b) => Date.parse(b.lastVisited) - Date.parse(a.lastVisited))
              .map((p, i, arr) => (
                <View key={p.placeId}>
                  <PlaceRow place={p} />
                  {i < arr.length - 1 ? <Divider inset={spacing.lg + 36 + spacing.md} /> : null}
                </View>
              ))}
          </View>
        )
      ) : null}
    </View>
  );

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={user.data?.displayName ?? `@${username}`}
        onBack={() => goBack()}
        right={menuButton}
      />
      <RatingList
        queryKey={qk.userRatings(username)}
        fetchPage={(cursor) => api.userRatings(username, { cursor, limit: PAGE_SIZE })}
        likeKeys={me ? [qk.feed()] : []}
        enabled={!!username && section === 'ratings'}
        header={header}
        emptyTitle={section === 'ratings' ? t('profile.ratingsEmpty') : ''}
        showAuthor={false}
      />
      {safety.element}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { gap: spacing.lg, paddingBottom: spacing.lg },
  unblock: { paddingHorizontal: spacing.xl, alignItems: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
});
