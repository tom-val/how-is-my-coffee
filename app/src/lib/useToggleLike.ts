import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api } from './api';
import type { QueryKey } from './queryKeys';
import type { RatingDetail, RatingPage } from '@/types';

/**
 * Like/unlike with an optimistic update applied across every cache the rating can appear in.
 *
 * A rating is denormalised on the server and duplicated in the client's caches too: the same coffee
 * shows up in the feed, on its author's profile, on the place page, in "coffees with me", and on
 * its own detail screen. Tapping the heart in one of those must move all of them at once, or the
 * user sees a heart that un-fills when they navigate. This is a port of the old web client's
 * `useToggleLike`, extended to the paginated (`InfiniteData`) shape and the detail cache.
 *
 * `pageKeys` are infinite-query keys (`{ pages: RatingPage[] }`); `detailKeys` are single
 * `RatingDetail` objects. Pass the keys a screen actually holds — missing one is only a stale
 * cache, never a wrong write, because the server is the source of truth on settle.
 */
export function useToggleLike(pageKeys: QueryKey[], detailKeys: QueryKey[] = []) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (ratingId: string) => api.toggleLike(ratingId),

    onMutate: async (ratingId: string) => {
      const allKeys = [...pageKeys, ...detailKeys];
      // Cancel in-flight refetches so a response from before the tap can't overwrite the new state.
      await Promise.all(allKeys.map((key) => queryClient.cancelQueries({ queryKey: key })));

      const snapshot = allKeys.map((key) => ({ key, data: queryClient.getQueryData(key) }));

      for (const key of pageKeys) {
        queryClient.setQueryData<InfiniteData<RatingPage>>(key, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => {
              const liked = page.likedRatingIds.includes(ratingId);
              // Only touch a page that actually holds this rating: `likedRatingIds` is per page, so
              // blindly appending would mark it liked on pages it doesn't even contain.
              if (!page.ratings.some((r) => r.ratingId === ratingId)) return page;
              return {
                ...page,
                likedRatingIds: liked
                  ? page.likedRatingIds.filter((id) => id !== ratingId)
                  : [...page.likedRatingIds, ratingId],
                ratings: page.ratings.map((r) =>
                  r.ratingId === ratingId
                    ? { ...r, likeCount: Math.max(0, r.likeCount + (liked ? -1 : 1)) }
                    : r,
                ),
              };
            }),
          };
        });
      }

      for (const key of detailKeys) {
        queryClient.setQueryData<RatingDetail>(key, (old) => {
          if (!old || old.rating.ratingId !== ratingId) return old;
          const liked = old.isLikedByMe;
          return {
            ...old,
            isLikedByMe: !liked,
            rating: {
              ...old.rating,
              likeCount: Math.max(0, old.rating.likeCount + (liked ? -1 : 1)),
            },
          };
        });
      }

      return { snapshot };
    },

    onError: (_err, _ratingId, context) => {
      for (const { key, data } of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: () => {
      // The optimistic numbers are a guess (someone else may have liked it in the meantime);
      // re-read so the counts settle on what the server actually has.
      for (const key of [...pageKeys, ...detailKeys]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  const toggleLike = useCallback(
    (ratingId: string) => {
      if (!mutation.isPending) mutation.mutate(ratingId);
    },
    [mutation],
  );

  return { toggleLike, isPending: mutation.isPending };
}
