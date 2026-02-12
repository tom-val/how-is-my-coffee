import { Link } from 'react-router-dom';
import { StarRating } from './StarRating';
import type { Rating } from '../types';

interface RatingCardProps {
  rating: Rating;
  showPlace?: boolean;
  showUser?: boolean;
}

export function RatingCard({ rating, showPlace = true, showUser = false }: RatingCardProps) {
  const date = new Date(rating.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
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
              >
                @{rating.username}
              </Link>
            )}
            {showPlace && (
              <Link
                to={`/places/${rating.placeId}`}
                className="block font-semibold text-stone-800 hover:text-amber-700"
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
      </div>
    </div>
  );
}
