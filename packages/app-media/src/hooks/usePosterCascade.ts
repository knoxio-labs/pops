import { useState } from 'react';

/**
 * usePosterCascade — 3-tier image fallback for poster images.
 *
 * Cascade order: posterUrl → fallbackPosterUrl → null (placeholder)
 *
 * Returns the current `src` to render and an `onError` handler to attach to the
 * `<img>` element. When `src` is `null` the caller should render a placeholder.
 */
export function usePosterCascade(
  posterUrl?: string | null,
  fallbackPosterUrl?: string | null
): { src: string | null; onError: () => void } {
  const [currentSrc, setCurrentSrc] = useState<string | null>(
    posterUrl ?? fallbackPosterUrl ?? null
  );
  const [usedFallback, setUsedFallback] = useState(!posterUrl && !!fallbackPosterUrl);
  const [showPlaceholder, setShowPlaceholder] = useState(!posterUrl && !fallbackPosterUrl);

  const onError = () => {
    if (!usedFallback && fallbackPosterUrl && currentSrc !== fallbackPosterUrl) {
      setCurrentSrc(fallbackPosterUrl);
      setUsedFallback(true);
      return;
    }
    setShowPlaceholder(true);
  };

  return {
    src: showPlaceholder ? null : currentSrc,
    onError,
  };
}
