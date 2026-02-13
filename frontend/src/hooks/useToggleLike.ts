import { useCallback } from 'react';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api, type PaginatedRatings } from '../api/client';

/**
 * Shared hook for toggling likes with optimistic updates across infinite query caches.
 * Accepts a list of query keys to update optimistically (e.g. ['feed'], ['userRatings', userId]).
 */
export function useToggleLike(queryKeys: unknown[][]) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (ratingId: string) => api.toggleLike(ratingId),
    onMutate: async (ratingId: string) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await Promise.all(queryKeys.map((key) => queryClient.cancelQueries({ queryKey: key })));

      // Snapshot previous data for rollback
      const previousData = queryKeys.map((key) => ({
        key,
        data: queryClient.getQueryData<InfiniteData<PaginatedRatings>>(key),
      }));

      // Optimistically update each cache
      for (const key of queryKeys) {
        queryClient.setQueryData<InfiniteData<PaginatedRatings>>(key, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => {
              const isCurrentlyLiked = page.likedRatingIds.includes(ratingId);
              const newLikedIds = isCurrentlyLiked
                ? page.likedRatingIds.filter((id) => id !== ratingId)
                : [...page.likedRatingIds, ratingId];

              return {
                ...page,
                likedRatingIds: newLikedIds,
                ratings: page.ratings.map((r) => {
                  if (r.ratingId !== ratingId) return r;
                  const currentCount = r.likeCount || 0;
                  return {
                    ...r,
                    likeCount: isCurrentlyLiked
                      ? Math.max(0, currentCount - 1)
                      : currentCount + 1,
                  };
                }),
              };
            }),
          };
        });
      }

      return { previousData };
    },
    onError: (_err, _ratingId, context) => {
      // Roll back to snapshots
      if (context?.previousData) {
        for (const { key, data } of context.previousData) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      // Refetch to sync with server
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  const toggleLike = useCallback(
    (ratingId: string) => {
      if (!mutation.isPending) {
        mutation.mutate(ratingId);
      }
    },
    [mutation],
  );

  return { toggleLike };
}
