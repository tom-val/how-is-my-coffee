import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onIntersect` when the sentinel element scrolls into view.
 * Returns a ref to attach to the sentinel <div>.
 */
export function useIntersectionObserver(
  onIntersect: () => void,
  enabled: boolean = true
): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect, enabled]);

  return sentinelRef;
}
