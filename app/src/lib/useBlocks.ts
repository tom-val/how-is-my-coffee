import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { api, errorMessage } from './api';
import { useAuth } from './auth';
import { confirm, confirmDestructive } from './confirm';
import { qk } from './queryKeys';
import { showToast } from './toast';
import type { Block, RatingDetail, RatingPage } from '@/types';

/**
 * Blocking, from any screen (see "Safety" in `docs/api-contract.md`).
 *
 * The server hides a blocked person's ratings, comments and likes everywhere — but only on the next
 * read. So a block also strips them out of every cache already on the device, right away, and then
 * marks those caches stale: the person disappears from the screen the moment the user confirms,
 * not after a pull-to-refresh.
 */

/** The infinite `RatingPage` lists a rating can sit in. Prefixes — they match every username/place. */
const PAGE_PREFIXES = [['feed'], ['userRatings'], ['userTagged'], ['placeRatings']] as const;

/** Everything a block or an unblock can change server-side. */
const AFFECTED_PREFIXES = [
  ...PAGE_PREFIXES,
  ['place'],
  ['mapPlaces'],
  ['friends'],
  ['followers'],
  ['userSearch'],
  ['user'],
] as const;

/** Drop one person's ratings, likes and comments from every cache on the device. */
function purgeUser(queryClient: QueryClient, userId: string): void {
  const strip = (page: RatingPage): RatingPage => ({
    ...page,
    ratings: page.ratings.filter((r) => r.userId !== userId),
  });
  for (const prefix of PAGE_PREFIXES) {
    // Most lists are infinite queries; the Profile tab holds a single `RatingPage` under the same
    // key family. Handle both shapes, leave anything else alone.
    queryClient.setQueriesData<InfiniteData<RatingPage> | RatingPage>(
      { queryKey: [...prefix] },
      (old) => {
        if (!old) return old;
        if ('pages' in old && Array.isArray(old.pages)) {
          return { ...old, pages: old.pages.map(strip) };
        }
        if ('ratings' in old && Array.isArray(old.ratings)) return strip(old);
        return old;
      },
    );
  }
  queryClient.setQueriesData<RatingDetail>({ queryKey: ['rating'] }, (old) => {
    if (!old?.rating) return old;
    return {
      ...old,
      likes: old.likes.filter((l) => l.userId !== userId),
      comments: old.comments.filter((c) => c.userId !== userId),
    };
  });
}

function invalidateAffected(queryClient: QueryClient): void {
  for (const prefix of AFFECTED_PREFIXES) {
    void queryClient.invalidateQueries({ queryKey: [...prefix] });
  }
  // Rating details are marked stale but not refetched while on screen: the detail of a rating by
  // the person just blocked would otherwise flash "This rating is gone" while its screen pops.
  void queryClient.invalidateQueries({ queryKey: ['rating'], refetchType: 'none' });
  void queryClient.invalidateQueries({ queryKey: qk.blocks() });
}

/** The people I have blocked. Only fetched where a screen needs it (a profile, Settings). */
export function useBlockList(enabled = true) {
  const { me } = useAuth();
  return useQuery({
    queryKey: qk.blocks(),
    queryFn: api.blocks,
    enabled: enabled && !!me,
  });
}

/** Who to block / unblock. `userId` is known everywhere except, sometimes, a bare username. */
export type BlockSubject = { username: string; userId?: string };

export function useBlockActions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const block = useMutation({
    mutationFn: (subject: BlockSubject) => api.block(subject.username),
    onSuccess: (created) => {
      queryClient.setQueryData<{ blocks: Block[] }>(qk.blocks(), (old) =>
        old
          ? {
              blocks: [created, ...old.blocks.filter((b) => b.userId !== created.userId)],
            }
          : old,
      );
      purgeUser(queryClient, created.userId);
      invalidateAffected(queryClient);
      showToast(t('safety.blockedToast', { username: created.username }));
    },
    onError: (e) => showToast(errorMessage(e, t)),
  });

  const unblock = useMutation({
    mutationFn: (subject: { userId: string; username: string }) => api.unblock(subject.userId),
    onSuccess: (_res, subject) => {
      queryClient.setQueryData<{ blocks: Block[] }>(qk.blocks(), (old) =>
        old ? { blocks: old.blocks.filter((b) => b.userId !== subject.userId) } : old,
      );
      invalidateAffected(queryClient);
      showToast(t('safety.unblockedToast', { username: subject.username }));
    },
    onError: (e) => showToast(errorMessage(e, t)),
  });

  /** Confirm, then block. `onBlocked` runs after the server agreed (e.g. leave the screen). */
  const askBlock = useCallback(
    (subject: BlockSubject, onBlocked?: () => void) =>
      confirmDestructive(
        t('safety.blockConfirmTitle', { username: subject.username }),
        t('safety.blockConfirmBody'),
        t('safety.block'),
        () => block.mutate(subject, { onSuccess: () => onBlocked?.() }),
      ),
    [block, t],
  );

  const askUnblock = useCallback(
    (subject: { userId: string; username: string }) =>
      confirm(
        t('safety.unblockConfirmTitle', { username: subject.username }),
        t('safety.unblockConfirmBody'),
        t('safety.unblock'),
        () => unblock.mutate(subject),
      ),
    [unblock, t],
  );

  return {
    askBlock,
    askUnblock,
    blocking: block.isPending,
    unblocking: unblock.isPending,
    /** The userId whose unblock is in flight, so a list can show the spinner on the right row. */
    unblockingUserId: unblock.isPending ? unblock.variables?.userId : undefined,
  };
}
