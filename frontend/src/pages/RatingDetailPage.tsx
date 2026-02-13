import { useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { StarRating } from '../components/StarRating';
import type { Rating, RatingDetail } from '../types';

export function RatingDetailPage() {
  const { ratingId } = useParams<{ ratingId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Use router state for instant display while fetching fresh data
  const stateRating = (location.state as { rating?: Rating } | null)?.rating;

  const { data, isLoading, error } = useQuery({
    queryKey: ['ratingDetail', ratingId],
    queryFn: () => api.getRatingDetail(ratingId!),
    enabled: !!ratingId,
  });

  const rating = data?.rating || stateRating;
  const likes = data?.likes ?? [];
  const comments = data?.comments ?? [];
  const isLikedByMe = data?.isLikedByMe ?? false;

  // Like toggle
  const likeMutation = useMutation({
    mutationFn: () => api.toggleLike(ratingId!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['ratingDetail', ratingId] });
      const previous = queryClient.getQueryData<RatingDetail>(['ratingDetail', ratingId]);
      queryClient.setQueryData<RatingDetail>(['ratingDetail', ratingId], (old) => {
        if (!old) return old;
        const wasLiked = old.isLikedByMe;
        return {
          ...old,
          isLikedByMe: !wasLiked,
          rating: {
            ...old.rating,
            likeCount: Math.max(0, (old.rating.likeCount || 0) + (wasLiked ? -1 : 1)),
          },
          likes: wasLiked
            ? old.likes.filter((l) => l.userId !== user?.userId)
            : [...old.likes, { userId: user!.userId, username: user!.username, displayName: user!.displayName }],
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['ratingDetail', ratingId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ratingDetail', ratingId] });
    },
  });

  // Comment submission
  const [commentText, setCommentText] = useState('');
  const commentMutation = useMutation({
    mutationFn: (text: string) => api.createComment(ratingId!, text),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['ratingDetail', ratingId] });
    },
  });

  function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || commentMutation.isPending) return;
    commentMutation.mutate(trimmed);
  }

  if (isLoading && !stateRating) {
    return <div className="p-4 text-center py-12 text-stone-400">Loading...</div>;
  }

  if (error && !rating) {
    return <div className="p-4 text-center py-12 text-red-500">Rating not found</div>;
  }

  if (!rating) return null;

  const date = new Date(rating.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const likeCount = rating.likeCount || 0;

  return (
    <div className="p-4 pb-20">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-800 font-medium mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Rating content */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
        {rating.photoUrl && (
          <img src={rating.photoUrl} alt="Coffee" className="w-full max-h-96 object-cover" />
        )}
        <div className="p-4">
          {rating.username && (
            <Link
              to={`/u/${rating.username}`}
              className="text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              @{rating.username}
            </Link>
          )}
          <Link
            to={`/places/${rating.placeId}`}
            className="block font-semibold text-stone-800 hover:text-amber-700"
          >
            {rating.placeName}
          </Link>
          {rating.drinkName && (
            <span className="block text-sm text-amber-600/80 font-medium">{rating.drinkName}</span>
          )}
          <span className="text-xs text-stone-400">{date}</span>

          <div className="mt-2">
            <StarRating value={rating.stars} size="md" />
          </div>

          {rating.description && (
            <p className="mt-3 text-stone-600">{rating.description}</p>
          )}

          {/* Like button */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={() => likeMutation.mutate()}
              disabled={likeMutation.isPending}
              className="flex items-center gap-1.5 text-sm transition-colors"
            >
              {isLikedByMe ? (
                <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-stone-400 hover:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              )}
              <span className={isLikedByMe ? 'text-red-500 font-medium' : 'text-stone-400'}>
                {likeCount > 0 ? likeCount : ''}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Liked by section */}
      {likes.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-stone-700 mb-2">
            Liked by ({likes.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {likes.map((like) => (
              <Link
                key={like.userId}
                to={`/u/${like.username}`}
                className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 border border-stone-100 text-sm hover:border-amber-200 transition-colors"
              >
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">
                  {like.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-stone-700">{like.displayName}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Comments section */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-stone-700 mb-3">
          Comments ({comments.length})
        </h2>

        {comments.length === 0 && (
          <p className="text-stone-400 text-sm">No comments yet. Be the first!</p>
        )}

        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.commentId}
              className="bg-white rounded-lg border border-stone-100 p-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <Link
                  to={`/u/${comment.username}`}
                  className="text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  {comment.displayName}
                </Link>
                <span className="text-xs text-stone-400">
                  {new Date(comment.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <p className="text-sm text-stone-600">{comment.text}</p>
            </div>
          ))}
        </div>

        {/* Comment input */}
        <form onSubmit={handleSubmitComment} className="mt-4 flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            maxLength={500}
            className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={!commentText.trim() || commentMutation.isPending}
            className="bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
          >
            {commentMutation.isPending ? '...' : 'Post'}
          </button>
        </form>
        {commentMutation.isError && (
          <p className="text-red-500 text-xs mt-1">
            {commentMutation.error instanceof Error ? commentMutation.error.message : 'Failed to post comment'}
          </p>
        )}
      </div>
    </div>
  );
}
