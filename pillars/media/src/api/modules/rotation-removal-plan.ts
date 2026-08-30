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
import { calculateRemovalDeficit, selectForDeficit } from './rotation-cycle-types.js';
import { type RankedCandidate, rankForRemoval, removableOnly } from './rotation-removal-ranking.js';
import { getDownloadingTmdbIds, type MovieAcquiredMap } from './rotation-removal.js';

/**
 * A movie the plan would mark, with the arithmetic that put it there.
 *
 * Persisted alongside the cycle log and returned by the preview: a scored
 * engine whose decisions cannot be reconstructed is not one anyone can argue
 * with, and the ordering defect this replaced went unnoticed for months
 * precisely because the log recorded outcomes and not reasons.
 *
 * A type alias rather than an interface on purpose: the log service stores this
 * in an opaque JSON column and types the field as `Record<string, unknown>`,
 * which only an alias satisfies.
 */
export type PlannedRemoval = {
  id: number;
  tmdbId: number;
  title: string;
  /** Position in the ranking, 1-based. For tied movies this is the draw's outcome. */
  rank: number;
  pressure: number;
  sizeGb: number;
  ageDays: number;
  ageAnchor: RankedCandidate['ageAnchor'];
  watchCount: number;
  quality: number;
  qualitySource: RankedCandidate['qualitySource'];
  keepWeight: number;
};

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
