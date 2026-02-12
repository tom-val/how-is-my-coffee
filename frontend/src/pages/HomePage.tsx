import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { RatingCard } from '../components/RatingCard';
import { Link } from 'react-router-dom';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

export function HomePage() {
  const { user } = useAuth();
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => api.getFeed(pageParam),
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!user,
  });

  const ratings = useMemo(
    () => data?.pages.flatMap((p) => p.ratings) ?? [],
    [data]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sentinelRef = useIntersectionObserver(handleLoadMore, hasNextPage && !isFetchingNextPage);

  return (
    <div className="p-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-stone-800">Friends Feed</h1>
        <Link
          to="/rate"
          className="bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-800 transition-colors"
        >
          + Rate
        </Link>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-stone-400">Loading...</div>
      )}

      {!isLoading && ratings.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">&#9749;</div>
          <p className="text-stone-500">No coffees in your feed yet</p>
          <p className="text-stone-400 text-sm mt-1">
            <Link to="/friends" className="text-amber-700 hover:text-amber-800 font-medium">
              Follow some friends
            </Link>
            {' '}to see their coffees here!
          </p>
        </div>
      )}

      <div className="space-y-4">
        {ratings.map((r) => (
          <RatingCard key={r.ratingId} rating={r} showUser />
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
