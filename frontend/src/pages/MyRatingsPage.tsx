import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { RatingCard } from '../components/RatingCard';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

export function MyRatingsPage() {
  const { user } = useAuth();
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['userRatings', user?.userId],
    queryFn: ({ pageParam }) => api.getUserRatings(user!.userId, pageParam),
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!user,
  });

  const ratings = useMemo(
    () => data?.pages.flatMap((p) => p.ratings ?? []) ?? [],
    [data]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sentinelRef = useIntersectionObserver(handleLoadMore, hasNextPage && !isFetchingNextPage);

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold text-stone-800 mb-4">My Coffees</h1>
      <p className="text-stone-500 text-sm mb-6">{ratings.length} coffee{ratings.length !== 1 ? 's' : ''} loaded</p>

      {isLoading && <div className="text-center py-12 text-stone-400">Loading...</div>}

      {!isLoading && ratings.length === 0 && (
        <div className="text-center py-12">
          <p className="text-stone-500">No coffees yet</p>
        </div>
      )}

      <div className="space-y-4">
        {ratings.map((r) => (
          <RatingCard key={r.ratingId} rating={r} />
        ))}
      </div>

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="text-center py-4 text-stone-400 text-sm">Loading more...</div>
      )}
    </div>
  );
}
