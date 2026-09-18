import { useInfiniteQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { CupIcon } from './icons';
import { RatingCard } from './rating-card';
import { SkeletonFeed } from './skeleton';
import { EmptyState } from './empty-state';
import { PAGE_SIZE, errorMessage } from '@/lib/api';
import type { QueryKey } from '@/lib/queryKeys';
import { useToggleLike } from '@/lib/useToggleLike';
import { colors, spacing } from '@/theme';
import type { RatingPage } from '@/types';

/**
 * The one paginated list of ratings, used by the feed, a place, a profile and "coffees with me".
 *
 * All of them are the same cursor-paginated `RatingPage`, differing only in which endpoint fills
 * them and which caches a like has to move. Keeping them one component is what makes the optimistic
 * heart consistent everywhere: `likeKeys` is the list of caches to update, and every caller passes
 * its own key plus whichever sibling caches are on screen.
 *
 * Four states, all of them real: skeleton on first load, error with the reason, a written empty
 * state, and the list. There is no full-screen spinner and no "nothing here" flashing before the
 * first page lands.
 */
export function RatingList({
  queryKey,
  fetchPage,
  likeKeys,
  enabled = true,
  header,
  emptyTitle,
  emptyBody,
  emptyAction,
  showAuthor = true,
  showPlace = true,
}: {
  queryKey: QueryKey;
  fetchPage: (cursor: string | null) => Promise<RatingPage>;
  /** Caches a like must move, beyond this list's own key. */
  likeKeys?: QueryKey[];
  enabled?: boolean;
  header?: React.ReactElement;
  emptyTitle: string;
  emptyBody?: string;
  emptyAction?: { label: string; onPress: () => void };
  showAuthor?: boolean;
  showPlace?: boolean;
}) {
  const { t } = useTranslation();

  const query = useInfiniteQuery({
    queryKey: queryKey as unknown[],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const { toggleLike } = useToggleLike([queryKey, ...(likeKeys ?? [])]);

  const ratings = useMemo(
    () => query.data?.pages.flatMap((p) => p.ratings) ?? [],
    [query.data],
  );
  const liked = useMemo(() => {
    const set = new Set<string>();
    for (const page of query.data?.pages ?? []) for (const id of page.likedRatingIds) set.add(id);
    return set;
  }, [query.data]);

  if (query.isLoading) {
    return (
      <View style={s.padded}>
        {header}
        <SkeletonFeed count={PAGE_SIZE >= 3 ? 3 : 1} />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={s.padded}>
        {header}
        <EmptyState
          title={t('common.somethingWrong')}
          body={errorMessage(query.error, t)}
          actionLabel={t('common.retry')}
          onAction={() => void query.refetch()}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={ratings}
      keyExtractor={(r) => r.ratingId}
      contentContainerStyle={s.content}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <RatingCard
          rating={item}
          liked={liked.has(item.ratingId)}
          onToggleLike={toggleLike}
          showAuthor={showAuthor}
          showPlace={showPlace}
        />
      )}
      ItemSeparatorComponent={() => <View style={s.gap} />}
      ListEmptyComponent={
        <EmptyState
          icon={<CupIcon size={26} color={colors.inkFaint} />}
          title={emptyTitle}
          body={emptyBody}
          actionLabel={emptyAction?.label}
          onAction={emptyAction?.onPress}
        />
      }
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View style={s.footer}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      onRefresh={() => void query.refetch()}
    />
  );
}

const s = StyleSheet.create({
  padded: { padding: spacing.lg, gap: spacing.lg },
  content: { padding: spacing.lg, gap: 0, paddingBottom: spacing.xxl * 2 },
  gap: { height: spacing.lg },
  footer: { paddingVertical: spacing.xl, alignItems: 'center' },
});
