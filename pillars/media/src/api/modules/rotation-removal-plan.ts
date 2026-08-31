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
import {
  type RankedCandidate,
  rankForRemoval,
  removableOnly,
  type RotationTuning,
} from './rotation-removal-ranking.js';
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
   * The head of the ranking, whether or not the deficit calls for any of it.
   * Empty unless the caller asked for it via `topCount`.
   */
  topRanked: PlannedRemoval[];
  /**
   * How many of the eligible movies actually carry pressure. Both counts are
   * zero when there is no deficit and no `topCount`: nothing is ranked then. The gap between
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
  tuning: RotationTuning;
  /**
   * Rank and return this many movies even when nothing needs removing. The
   * settings preview asks the question hypothetically — "who is next out?" —
   * and an empty answer whenever the disk happens to be healthy would make the
   * sliders impossible to judge.
   */
  topCount?: number;
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
  const { freeSpaceGb, targetFreeGb, graceDays, movieSizes, acquiredAt, tuning } = args;
  const leavingGb = rotationRemovalQueries.getLeavingMovieSizeGb(db, movieSizes);
  const deficitGb = calculateRemovalDeficit(targetFreeGb, freeSpaceGb, leavingGb);

  // Answer before going near Radarr's queue. Ranking a library nobody has asked
  // to shrink would let a transient failure of the queue endpoint throw out of
  // the whole cycle, taking the addition phase — which needs none of this — down
  // with it. A preview asks the question deliberately, so it opts back in.
  if (deficitGb <= 0 && args.topCount === undefined) {
    return {
      deficitGb,
      leavingGb,
      toMark: [],
      skippedForOvershoot: [],
      topRanked: [],
      eligibleCount: 0,
      removableCount: 0,
    };
  }

  const downloadingIds = await getDownloadingTmdbIds(client);
  const eligible = rotationRemovalQueries.getEligibleForRemoval(db, movieSizes, downloadingIds);
  const ranked = rankForRemoval({ candidates: eligible, acquiredAt, graceDays, tuning });
  const removable = removableOnly(ranked);
  const counts = { eligibleCount: eligible.length, removableCount: removable.length };
  const rankOf = new Map(ranked.map((candidate, index) => [candidate.tmdbId, index + 1]));
  const { selected, skipped } = selectForDeficit(
    removable,
    (movie) => movieSizes.get(movie.tmdbId) ?? 0,
    deficitGb
  );

  const at = (candidate: RankedCandidate): PlannedRemoval =>
    describe(candidate, rankOf.get(candidate.tmdbId) ?? 0, movieSizes);
  const topRanked = removable.slice(0, args.topCount ?? 0).map(at);

  return {
    deficitGb,
    leavingGb,
    toMark: selected.map(at),
    skippedForOvershoot: skipped.map(at),
    topRanked,
    ...counts,
  };
}
