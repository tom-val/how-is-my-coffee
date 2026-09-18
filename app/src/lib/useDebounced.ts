import { useEffect, useState } from 'react';

/**
 * The value, but only after it has stopped changing for `delay` ms.
 *
 * Used by every "search as you type" field: the companion picker, the add-friend field and the
 * Nominatim place search, which is rate-limited and must see one request per pause rather than one
 * per keystroke.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
