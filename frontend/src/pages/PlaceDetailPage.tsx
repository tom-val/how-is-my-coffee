import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { RatingCard } from '../components/RatingCard';
import { StarRating } from '../components/StarRating';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface DrinkAverage {
  drinkName: string;
  avgRating: number;
  raterCount: number;
}

export function PlaceDetailPage() {
  const { placeId } = useParams<{ placeId: string }>();

  const { data: place, isLoading: placeLoading } = useQuery({
    queryKey: ['place', placeId],
    queryFn: () => api.getPlace(placeId!),
    enabled: !!placeId,
  });

  const {
    data: ratingsData,
    isLoading: ratingsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['placeRatings', placeId],
    queryFn: ({ pageParam }) => api.getPlaceRatings(placeId!, pageParam),
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!placeId,
  });

  const ratings = useMemo(
    () => ratingsData?.pages.flatMap((p) => p.ratings ?? []) ?? [],
    [ratingsData]
  );

  const isLoading = placeLoading || ratingsLoading;

  // Compute per-drink averages (latest rating per user per drink)
  const drinkAverages = useMemo<DrinkAverage[]>(() => {
    const withDrink = ratings.filter((r) => r.drinkName);
    if (withDrink.length === 0) return [];

    // Group by drinkName (case-insensitive key)
    const byDrink = new Map<string, typeof withDrink>();
    for (const r of withDrink) {
      const key = r.drinkName!.toLowerCase().trim();
      if (!byDrink.has(key)) byDrink.set(key, []);
      byDrink.get(key)!.push(r);
    }

    const result: DrinkAverage[] = [];
    for (const [, drinkRatings] of byDrink) {
      // Keep only latest per user (ratings are sorted newest-first from the API)
      const latestByUser = new Map<string, number>();
      for (const r of drinkRatings) {
        if (!latestByUser.has(r.userId)) {
          latestByUser.set(r.userId, r.stars);
        }
      }

      const values = Array.from(latestByUser.values());
      const avg = Math.round((values.reduce((sum, s) => sum + s, 0) / values.length) * 10) / 10;

      result.push({
        drinkName: drinkRatings[0].drinkName!,
        avgRating: avg,
        raterCount: values.length,
      });
    }

    // Sort by rater count desc, then avgRating desc
    result.sort((a, b) => b.raterCount - a.raterCount || b.avgRating - a.avgRating);
    return result;
  }, [ratings]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sentinelRef = useIntersectionObserver(handleLoadMore, hasNextPage && !isFetchingNextPage);

  if (isLoading) {
    return <div className="p-4 text-center py-12 text-stone-400">Loading...</div>;
  }

  return (
    <div className="p-4 pb-20">
      {place && (
        <div className="mb-6">
          <h1 className="text-xl font-bold text-stone-800">{place.name}</h1>
          {place.address && <p className="text-stone-500 text-sm mt-1">{place.address}</p>}
          <div className="flex items-center gap-3 mt-3">
            <StarRating value={place.avgRating} size="md" />
            <span className="text-sm text-stone-500">
              ({place.ratingCount} rating{place.ratingCount !== 1 ? 's' : ''})
            </span>
          </div>
        </div>
      )}

      {drinkAverages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-stone-700 mb-3">Drinks</h2>
          <div className="space-y-2">
            {drinkAverages.map((drink) => (
              <div
                key={drink.drinkName.toLowerCase()}
                className="flex items-center justify-between bg-white rounded-lg border border-stone-100 px-4 py-3"
              >
                <div>
                  <span className="font-medium text-stone-800">{drink.drinkName}</span>
                  <span className="ml-2 text-xs text-stone-400">
                    {drink.raterCount} rater{drink.raterCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <StarRating value={drink.avgRating} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold text-stone-700 mb-4">All Reviews</h2>

      {ratings.length === 0 && (
        <p className="text-stone-500 text-center py-8">No reviews yet</p>
      )}

      <div className="space-y-4">
        {ratings.map((r) => (
          <RatingCard key={r.ratingId} rating={r} showPlace={false} showUser />
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
