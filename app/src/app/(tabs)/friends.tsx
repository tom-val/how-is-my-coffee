import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/brand-header';
import { EmptyState } from '@/components/empty-state';
import { PeopleIcon, SearchIcon } from '@/components/icons';
import { SkeletonRow } from '@/components/skeleton';
import { Button, Divider, SegmentedRow, TextField, Txt } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { useDebounced } from '@/lib/useDebounced';
import { colors, radius, spacing } from '@/theme';

type Tab = 'following' | 'followers';

/**
 * Following and followers, plus the one way to add someone: type their username.
 *
 * The search is the primary control, sitting above the tabs, because "add a friend" is the only
 * reason anyone opens this screen twice. It fires from two characters (the API's own minimum) and
 * is debounced, so a typed name is one request rather than eight.
 */
export default function FriendsScreen() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('following');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim().toLowerCase(), 300);

  const friends = useQuery({ queryKey: qk.friends(), queryFn: api.friends });
  const followers = useQuery({ queryKey: qk.followers(), queryFn: api.followers });

  const results = useQuery({
    queryKey: qk.userSearch(debouncedSearch),
    queryFn: () => api.searchUsers(debouncedSearch),
    enabled: debouncedSearch.length >= 2,
  });

  const followingIds = useMemo(
    () => new Set((friends.data?.friends ?? []).map((f) => f.friendUserId)),
    [friends.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.friends() });
    void queryClient.invalidateQueries({ queryKey: qk.feed() });
  };

  const follow = useMutation({
    mutationFn: (username: string) => api.addFriend(username),
    onSuccess: (friend) => {
      invalidate();
      showToast(t('friends.followed', { name: friend.friendDisplayName }));
    },
    onError: (e) => showToast(errorMessage(e, t)),
  });

  const unfollow = useMutation({
    // The display name rides along so the toast can name who was unfollowed — by the time it
    // resolves, the friends list no longer holds them.
    mutationFn: ({ userId }: { userId: string; name: string }) => api.removeFriend(userId),
    onSuccess: (_result, { name }) => {
      invalidate();
      showToast(t('friends.unfollowed', { name }));
    },
    onError: (e) => showToast(errorMessage(e, t)),
  });

  const askUnfollow = (userId: string, name: string) =>
    confirmDestructive(
      t('friends.unfollowConfirm', { name }),
      undefined,
      t('friends.unfollow'),
      () => unfollow.mutate({ userId, name }),
    );

  const searching = debouncedSearch.length >= 2;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <BrandHeader title={t('friends.title')} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('friends.add')}
          placeholder={t('friends.addPlaceholder')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="search"
        />

        {searching ? (
          <View style={s.group}>
            {results.isLoading ? (
              <View style={s.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Txt variant="label" tone="soft">
                  {t('friends.searching')}
                </Txt>
              </View>
            ) : (results.data?.users ?? []).filter((u) => u.userId !== me?.userId).length === 0 ? (
              <View style={s.loadingRow}>
                <SearchIcon size={18} color={colors.inkFaint} />
                <Txt variant="label" tone="soft">
                  {t('friends.noResults')}
                </Txt>
              </View>
            ) : (
              (results.data?.users ?? [])
                .filter((u) => u.userId !== me?.userId)
                .map((u, i, arr) => (
                  <View key={u.userId}>
                    <UserRow
                      username={u.username}
                      displayName={u.displayName}
                      action={
                        followingIds.has(u.userId) ? (
                          <Button
                            title={t('friends.unfollow')}
                            variant="quiet"
                            size="sm"
                            onPress={() => askUnfollow(u.userId, u.displayName)}
                          />
                        ) : (
                          <Button
                            title={t('friends.follow')}
                            variant="ghost"
                            size="sm"
                            loading={follow.isPending && follow.variables === u.username}
                            onPress={() => follow.mutate(u.username)}
                          />
                        )
                      }
                    />
                    {i < arr.length - 1 ? <Divider inset={spacing.lg + 40 + spacing.md} /> : null}
                  </View>
                ))
            )}
          </View>
        ) : null}

        <SegmentedRow<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'following', label: t('friends.following') },
            { value: 'followers', label: t('friends.followers') },
          ]}
        />

        <View style={s.group}>
          {tab === 'following' ? (
            friends.isLoading ? (
              <View style={s.padded}>
                <SkeletonRow />
                <SkeletonRow />
              </View>
            ) : (friends.data?.friends ?? []).length === 0 ? (
              <EmptyState
                icon={<PeopleIcon size={26} color={colors.inkFaint} />}
                title={t('friends.followingEmpty')}
              />
            ) : (
              (friends.data?.friends ?? []).map((f, i, arr) => (
                <View key={f.friendUserId}>
                  <UserRow
                    username={f.friendUsername}
                    displayName={f.friendDisplayName}
                    action={
                      <Button
                        title={t('friends.unfollow')}
                        variant="quiet"
                        size="sm"
                        onPress={() => askUnfollow(f.friendUserId, f.friendDisplayName)}
                      />
                    }
                  />
                  {i < arr.length - 1 ? <Divider inset={spacing.lg + 40 + spacing.md} /> : null}
                </View>
              ))
            )
          ) : followers.isLoading ? (
            <View style={s.padded}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (followers.data?.followers ?? []).length === 0 ? (
            <EmptyState
              icon={<PeopleIcon size={26} color={colors.inkFaint} />}
              title={t('friends.followersEmpty')}
            />
          ) : (
            (followers.data?.followers ?? []).map((f, i, arr) => (
              <View key={f.followerUserId}>
                <UserRow
                  username={f.followerUsername}
                  displayName={f.followerDisplayName}
                  action={
                    followingIds.has(f.followerUserId) ? null : (
                      <Button
                        title={t('friends.follow')}
                        variant="ghost"
                        size="sm"
                        onPress={() => follow.mutate(f.followerUsername)}
                      />
                    )
                  }
                />
                {i < arr.length - 1 ? <Divider inset={spacing.lg + 40 + spacing.md} /> : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 3 },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  padded: { padding: spacing.lg },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
});
