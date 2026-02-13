import { Link, useNavigate } from 'react-router-dom';
import { StarRating } from './StarRating';
import type { Rating } from '../types';

interface RatingCardProps {
  rating: Rating;
  showPlace?: boolean;
  showUser?: boolean;
  isLikedByMe?: boolean;
  onToggleLike?: (ratingId: string) => void;
}

export function RatingCard({
  rating,
  showPlace = true,
  showUser = false,
  isLikedByMe = false,
  onToggleLike,
}: RatingCardProps) {
  const navigate = useNavigate();

  const date = new Date(rating.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const likeCount = rating.likeCount || 0;
  const commentCount = rating.commentCount || 0;

  function handleCardClick() {
    navigate(`/ratings/${rating.ratingId}`, { state: { rating } });
  }

  function handleLikeClick(e: React.MouseEvent) {
    e.stopPropagation();
    onToggleLike?.(rating.ratingId);
  }

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden cursor-pointer"
      onClick={handleCardClick}
    >
      {rating.photoUrl && (
        <img
          src={rating.photoUrl}
          alt="Coffee"
          className="w-full max-h-96 object-cover"
        />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            {showUser && rating.username && (
              <Link
                to={`/u/${rating.username}`}
                className="text-sm font-medium text-amber-700 hover:text-amber-800"
                onClick={(e) => e.stopPropagation()}
              >
                @{rating.username}
              </Link>
            )}
            {showPlace && (
              <Link
                to={`/places/${rating.placeId}`}
                className="block font-semibold text-stone-800 hover:text-amber-700"
                onClick={(e) => e.stopPropagation()}
              >
                {rating.placeName}
              </Link>
            )}
            {rating.drinkName && (
              <span className="block text-sm text-amber-600/80 font-medium">{rating.drinkName}</span>
            )}
          </div>
          <span className="text-xs text-stone-400 shrink-0 ml-2">{date}</span>
        </div>
        <StarRating value={rating.stars} size="sm" />
        {rating.description && (
          <p className="mt-2 text-sm text-stone-600">{rating.description}</p>
        )}

        {/* Like & comment actions */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-stone-100">
          <button
            type="button"
            onClick={handleLikeClick}
            className="flex items-center gap-1 text-sm transition-colors"
          >
            {isLikedByMe ? (
              <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-stone-400 hover:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            )}
            <span className={`${isLikedByMe ? 'text-red-500' : 'text-stone-400'}`}>
              {likeCount > 0 ? likeCount : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
            className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
            </svg>
            <span>{commentCount > 0 ? commentCount : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
