/**
 * A movie the cycle marked, with the ranking components that put it there.
 *
 * Everything past `title` is optional because entries written before the
 * scored engine carry only the reference, and an old log must still render.
 */
export interface MarkedMovie {
  tmdbId: number;
  title: string;
  rank?: number;
  pressure?: number;
  sizeGb?: number;
  ageDays?: number;
  ageAnchor?: 'acquired' | 'watched' | 'unknown';
  watchCount?: number;
  quality?: number;
  qualitySource?: 'elo' | 'tmdb' | 'blended' | 'none';
  keepWeight?: number;
  abandonedProgress?: number | null;
  abandonWeight?: number;
}

export interface LogDetails {
  marked?: MarkedMovie[];
  skippedForOvershoot?: MarkedMovie[];
  removed?: { tmdbId: number; title: string }[];
  added?: { tmdbId: number; title: string }[];
  failed?: { tmdbId: number; title: string; error?: string }[];
}

export interface LogEntryData {
  id: number;
  executedAt: string;
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
  details: string | null;
}

export function parseDetails(raw: string | null): LogDetails | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LogDetails;
  } catch {
    return null;
  }
}
