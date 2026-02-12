interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
}

export function StarRating({ value, onChange, size = 'md' }: StarRatingProps) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };
  const sizeClass = sizes[size];
  const interactive = !!onChange;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value >= star;
        const half = !filled && value >= star - 0.5;

        return (
          <div key={star} className={`relative ${interactive ? 'cursor-pointer' : ''}`}>
            {interactive && (
              <>
                <button
                  type="button"
                  className="absolute left-0 top-0 w-1/2 h-full z-10 opacity-0"
                  onClick={() => onChange(star - 0.5)}
                  aria-label={`Rate ${star - 0.5} stars`}
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 w-1/2 h-full z-10 opacity-0"
                  onClick={() => onChange(star)}
                  aria-label={`Rate ${star} stars`}
                />
              </>
            )}
            <svg className={sizeClass} viewBox="0 0 24 24" fill="none">
              {/* Background (empty) star */}
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill="#D1D5DB"
              />
              {/* Filled star */}
              {filled && (
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill="#F59E0B"
                />
              )}
              {/* Half star */}
              {half && (
                <clipPath id={`half-${star}`}>
                  <rect x="0" y="0" width="12" height="24" />
                </clipPath>
              )}
              {half && (
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill="#F59E0B"
                  clipPath={`url(#half-${star})`}
                />
              )}
            </svg>
          </div>
        );
      })}
      <span className="ml-1 text-sm text-stone-500 font-medium">{value.toFixed(1)}</span>
    </div>
  );
}
