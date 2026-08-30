/**
 * Shared types + pure policy math for the rotation cycle (api-layer).
 *
 * Ported from the monolith `rotation-cycle-types.ts` + the pure helpers of
 * `removal-selection.ts` / `addition-gating.ts`. The `RotationMovieRef` /
 * `RotationFailedMovieRef` shapes are re-exported from the db `rotationLog`
 * service so the cycle result and the persisted log share one definition.
 */
import type { RotationFailedMovieRef, RotationMovieRef } from '../../db/index.js';

export type { RotationFailedMovieRef, RotationMovieRef } from '../../db/index.js';

const BYTES_PER_GB = 1_073_741_824;

export interface RotationCycleResult {
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
  marked: RotationMovieRef[];
  /** Stepped over so the batch would not overshoot the deficit. */
  skippedForOvershoot: RotationMovieRef[];
  removed: RotationMovieRef[];
  added: RotationMovieRef[];
  failed: RotationFailedMovieRef[];
}

export function emptyResult(targetFreeGb: number): RotationCycleResult {
  return {
    moviesMarkedLeaving: 0,
    moviesRemoved: 0,
    moviesAdded: 0,
    removalsFailed: 0,
    freeSpaceGb: 0,
    targetFreeGb,
    skippedReason: null,
    marked: [],
    skippedForOvershoot: [],
    removed: [],
    added: [],
    failed: [],
  };
}

/** Convert a byte size to GB. */
export function bytesToGb(bytes: number): number {
  return bytes / BYTES_PER_GB;
}

/**
 * GB of movies that must be removed:
 * `target_free - current_free - sizeOf(leaving movies)`, clamped to >= 0.
 */
export function calculateRemovalDeficit(
  targetFreeGb: number,
  currentFreeGb: number,
  leavingSizeGb: number
): number {
  return Math.max(0, targetFreeGb - currentFreeGb - leavingSizeGb);
}

/**
 * How much a single pick may exceed the deficit still outstanding before the
 * walk looks past it. 1.5 leaves ordinary variation alone and only reacts to a
 * pick that would free half again more than is being asked for.
 */
const OVERSHOOT_TOLERANCE = 1.5;

/** A removal batch: what the walk took, and what it stepped over to avoid overshooting. */
export interface DeficitSelection<T> {
  selected: T[];
  skipped: T[];
}

/**
 * Walk `eligible` in rank order and take movies until `deficitGb` is covered,
 * stepping over a pick that would overshoot the outstanding remainder by more
 * than {@link OVERSHOOT_TOLERANCE} when something further down the ranking
 * still fits.
 *
 * File sizes are heavily skewed — a 90 GB remux next to a 3 GB encode — so an
 * unconditional walk can free double what was asked for purely because of the
 * order it met things in. Measured on the live library, a 40 GB deficit took
 * 87 GB.
 *
 * Two properties keep this from becoming the size-ordering the ranking
 * deliberately excludes. The **first** eligible movie is always taken, so the
 * top of the ranking can never be pinned as permanently safe by being large —
 * every movie reaches the front eventually. And a movie is only stepped over
 * when a fitting alternative actually exists below it; when nothing else fits,
 * the overshoot is accepted rather than leaving the deficit unmet.
 */
export function selectForDeficit<T>(
  eligible: readonly T[],
  sizeOfGb: (item: T) => number,
  deficitGb: number
): DeficitSelection<T> {
  const selected: T[] = [];
  const skipped: T[] = [];
  if (deficitGb <= 0) return { selected, skipped };

  const withFiles = eligible.filter((item) => sizeOfGb(item) > 0);
  let accumulated = 0;

  for (let i = 0; i < withFiles.length; i++) {
    const item = withFiles[i];
    if (item === undefined) continue;
    const sizeGb = sizeOfGb(item);
    const remaining = deficitGb - accumulated;
    const budget = remaining * OVERSHOOT_TOLERANCE;

    const overshoots = sizeGb > budget;
    const somethingElseFits = withFiles.slice(i + 1).some((later) => sizeOfGb(later) <= budget);

    if (selected.length > 0 && overshoots && somethingElseFits) {
      skipped.push(item);
      continue;
    }

    selected.push(item);
    accumulated += sizeGb;
    if (accumulated >= deficitGb) break;
  }

  return { selected, skipped };
}

/**
 * How many movies may be added without dropping below the target. Returns 0
 * when already below target (or `avgMovieGb <= 0`); otherwise
 * `min(dailyAdditions, floor((free - target) / avgMovieGb))`.
 */
export function getAdditionBudget(
  freeSpaceGb: number,
  targetFreeGb: number,
  avgMovieGb: number,
  dailyAdditions: number
): number {
  if (freeSpaceGb < targetFreeGb) return 0;
  if (avgMovieGb <= 0) return 0;
  const maxBySpace = Math.floor((freeSpaceGb - targetFreeGb) / avgMovieGb);
  return Math.min(dailyAdditions, maxBySpace);
}
