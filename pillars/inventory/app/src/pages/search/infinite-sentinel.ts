import { useEffect, useRef } from 'react';

import type { RefObject } from 'react';

/** Observes a list sentinel and requests the next page when it approaches view. */
export function useInfiniteSentinel(
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  onFetchNextPage: () => void
): RefObject<HTMLDivElement | null> {
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (
      node === null ||
      !hasNextPage ||
      isFetchingNextPage ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onFetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onFetchNextPage]);

  return sentinel;
}
