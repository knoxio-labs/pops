/** Movie fields rendered by a comparison card. */
export interface ComparisonMovieCardMovie {
  id: number;
  title: string;
  posterUrl: string | null;
}

/** Comparison card inputs, including callbacks for its optional actions. */
export interface ComparisonMovieCardProps {
  movie: ComparisonMovieCardMovie;
  onPick: () => void;
  disabled?: boolean;
  /** ELO score delta shown as an animated badge (positive = gain, negative = loss). */
  scoreDelta?: number | null;
  /** Whether this card won the last comparison. `undefined` = neutral, `false` = lost. */
  isWinner?: boolean;
  onToggleWatchlist?: () => void;
  isOnWatchlist?: boolean;
  watchlistPending?: boolean;
  onMarkStale?: () => void;
  stalePending?: boolean;
  onNA?: () => void;
  naPending?: boolean;
  onBlacklist?: () => void;
  blacklistPending?: boolean;
}
