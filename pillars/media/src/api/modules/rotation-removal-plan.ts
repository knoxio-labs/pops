/**
 * What the removal phase would do, computed without doing any of it.
 *
 * The cycle and the preview route share this so they cannot drift: a preview
 * that models the engine rather than running it is worth very little, and the
 * only reason this file exists is that the cycle's planning used to be
 * inseparable from its writes.
 *
 * Nothing here writes to the database or mutates Radarr.
 */
import { type MediaDb, type MovieSizeMap, rotationRemovalQueries } from '../../db/index.js';
import { type RadarrClient } from '../clients/arr/index.js';
import {
  calculateRemovalDeficit,
  type PlannedRemoval,
  selectForDeficit,
} from './rotation-cycle-types.js';
import { type RankedCandidate, rankForRemoval, removableOnly } from './rotation-removal-ranking.js';
import { getDownloadingTmdbIds, type MovieAcquiredMap } from './rotation-removal.js';

export interface RemovalPlan {
  deficitGb: number;
  /** Size already accounted for by movies sitting in the `leaving` state. */
  leavingGb: number;
  toMark: PlannedRemoval[];
  /** Stepped over so the batch would not overshoot the deficit. */
  skippedForOvershoot: PlannedRemoval[];
  eligibleCount: number;
  /**
   * How many of the eligible movies actually carry pressure. The gap between
   * this and `eligibleCount` is the grace-window and unknown-age tail, which is
   * off limits — a deficit larger than what this covers goes unmet by design.
   */
  removableCount: number;
}

export interface RemovalPlanArgs {
  freeSpaceGb: number;
  targetFreeGb: number;
  graceDays: number;
  movieSizes: MovieSizeMap;
  acquiredAt: MovieAcquiredMap;
}

function describe(
  candidate: RankedCandidate,
  rank: number,
  movieSizes: MovieSizeMap
): PlannedRemoval {
  return {
    id: candidate.id,
    tmdbId: candidate.tmdbId,
    title: candidate.title,
    rank,
    pressure: candidate.pressure,
    sizeGb: movieSizes.get(candidate.tmdbId) ?? 0,
    ageDays: candidate.ageDays,
    ageAnchor: candidate.ageAnchor,
    watchCount: candidate.watchCount,
    quality: candidate.quality,
    qualitySource: candidate.qualitySource,
    keepWeight: candidate.keepWeight,
  };
}

/**
 * Rank the eligible movies and choose enough of them to cover the deficit.
 *
 * Read-only. Note the ranking's tiebreak is re-rolled on every call, so two
 * plans computed from identical state can differ where movies tie on pressure
 * — which is why the executed plan is logged rather than assumed reproducible.
 */
export async function planRemoval(
  db: MediaDb,
  client: RadarrClient,
  args: RemovalPlanArgs
): Promise<RemovalPlan> {
  const { freeSpaceGb, targetFreeGb, graceDays, movieSizes, acquiredAt } = args;
  const leavingGb = rotationRemovalQueries.getLeavingMovieSizeGb(db, movieSizes);
  const deficitGb = calculateRemovalDeficit(targetFreeGb, freeSpaceGb, leavingGb);

  const downloadingIds = await getDownloadingTmdbIds(client);
  const eligible = rotationRemovalQueries.getEligibleForRemoval(db, movieSizes, downloadingIds);
  const ranked = rankForRemoval({ candidates: eligible, acquiredAt, graceDays });
  const removable = removableOnly(ranked);
  const counts = { eligibleCount: eligible.length, removableCount: removable.length };
  if (deficitGb <= 0) {
    return { deficitGb, leavingGb, toMark: [], skippedForOvershoot: [], ...counts };
  }

  const rankOf = new Map(ranked.map((candidate, index) => [candidate.tmdbId, index + 1]));
  const { selected, skipped } = selectForDeficit(
    removable,
    (movie) => movieSizes.get(movie.tmdbId) ?? 0,
    deficitGb
  );

  const at = (candidate: RankedCandidate): PlannedRemoval =>
    describe(candidate, rankOf.get(candidate.tmdbId) ?? 0, movieSizes);

  return {
    deficitGb,
    leavingGb,
    toMark: selected.map(at),
    skippedForOvershoot: skipped.map(at),
    ...counts,
  };
}
