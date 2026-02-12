import { useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getUserId } from '../api/client';
import { RatingCard } from '../components/RatingCard';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

export function FriendRatingsPage() {
  const { username } = useParams<{ username: string }>();
  const queryClient = useQueryClient();
  const currentUserId = getUserId();
  const [followError, setFollowError] = useState('');

  const { data: user, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ['user', username],
    queryFn: () => api.getUser(username!),
    enabled: !!username,
  });

  const {
    data: ratingsData,
    isLoading: ratingsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['userRatings', user?.userId],
    queryFn: ({ pageParam }) => api.getUserRatings(user!.userId, pageParam),
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!user?.userId,
  });

  const ratings = useMemo(
    () => ratingsData?.pages.flatMap((p) => p.ratings ?? []) ?? [],
    [ratingsData]
  );

  // Check if already friends
  const { data: friendsData } = useQuery({
    queryKey: ['friends', currentUserId],
    queryFn: () => api.getFriends(currentUserId!),
    enabled: !!currentUserId,
  });

  const isOwnProfile = currentUserId === user?.userId;
  const isAlreadyFriend = friendsData?.friends?.some((f) => f.friendUserId === user?.userId) ?? false;
  const showFollowButton = currentUserId && user && !isOwnProfile && !isAlreadyFriend;

  const followMutation = useMutation({
    mutationFn: () => api.addFriend(username!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends', currentUserId] });
      setFollowError('');
    },
    onError: (err) => {
      setFollowError(err instanceof Error ? err.message : 'Failed to follow');
    },
  });

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sentinelRef = useIntersectionObserver(handleLoadMore, hasNextPage && !isFetchingNextPage);

  if (userLoading) return <div className="p-4 text-center py-12 text-stone-400">Loading...</div>;
  if (userError) return <div className="p-4 text-center py-12 text-red-500">User not found</div>;

  return (
    <div className="p-4 pb-20">
      <div className="mb-4">
        <Link
          to={currentUserId ? '/' : '/login'}
          className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-800 font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {currentUserId ? 'Home' : 'Sign in'}
        </Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-lg">
            {user?.displayName?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-800">{user?.displayName}</h1>
            <p className="text-stone-500 text-sm">@{user?.username}</p>
          </div>
        </div>
        {showFollowButton && (
          <button
            onClick={() => followMutation.mutate()}
            disabled={followMutation.isPending}
            className="bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
          >
            {followMutation.isPending ? 'Following...' : '+ Follow'}
          </button>
        )}
        {currentUserId && !isOwnProfile && isAlreadyFriend && (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.06l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Following
          </span>
        )}
      </div>
      {followError && <p className="text-red-500 text-sm mb-4">{followError}</p>}

      <p className="text-stone-500 text-sm mb-4">{ratings.length} coffee{ratings.length !== 1 ? 's' : ''} loaded</p>

      {ratingsLoading && <div className="text-center py-8 text-stone-400">Loading ratings...</div>}

      {!ratingsLoading && ratings.length === 0 && (
        <p className="text-stone-500 text-center py-8">No coffees yet</p>
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
