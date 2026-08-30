/**
 * The rotation cycle orchestration (api-layer).
 *
 * One cycle: batch-sync sources → sweep expired `leaving` movies (delete from
 * Radarr) → measure free space on the volume holding the Radarr root folder →
 * rank the eligible movies by removal pressure and mark enough of them
 * `leaving` to cover the deficit, stepping over a pick that would overshoot it
 * when something further down still fits → re-measure
 * that volume → add up to the daily cap of candidates when space allows. Returns a {@link RotationCycleResult} the scheduler writes
 * to the rotation log. Ported from the monolith `rotation-cycle.ts`; repointed
 * onto the env-only Radarr client + the pillar's `rotation_settings` kv table.
 */
import { type MediaDb, type MovieSizeMap, rotationRemovalQueries } from '../../db/index.js';
import {
  getRadarrClient,
  getRadarrRootFolderPath,
  type RadarrClient,
} from '../clients/arr/index.js';
import { addMoviesFromQueue } from './rotation-addition.js';
import { getRotationCyclePolicy } from './rotation-cycle-policy.js';
import {
  emptyResult,
  getAdditionBudget,
  type PlannedRemoval,
  type RotationCycleResult,
} from './rotation-cycle-types.js';
import { planRemoval, type RemovalPlan } from './rotation-removal-plan.js';
import {
  getRadarrDiskSpace,
  getRadarrMovieFacts,
  type MovieAcquiredMap,
  processExpiredMovies,
  RotationDiskSelectionError,
} from './rotation-removal.js';
import { syncAllSources } from './rotation-sync-all.js';

/** A removal plan, or the reason a real cycle would not have got that far. */
export interface RemovalPreview {
  plan: RemovalPlan | null;
  skippedReason: string | null;
}

interface MarkLeavingOutcome {
  marked: PlannedRemoval[];
  skipped: PlannedRemoval[];
}

interface MarkLeavingArgs {
  freeSpaceGb: number;
  targetFreeGb: number;
  leavingDays: number;
  graceDays: number;
  movieSizes: MovieSizeMap;
  acquiredAt: MovieAcquiredMap;
}

/**
 * Plan the removals, then commit the plan. The planning half is shared with the
 * preview route so the two cannot drift; only the `markMoviesAsLeaving` write
 * below is exclusive to a real cycle.
 */
async function markLeaving(
  db: MediaDb,
  client: RadarrClient,
  args: MarkLeavingArgs
): Promise<MarkLeavingOutcome> {
  const { leavingDays, ...planArgs } = args;
  const plan = await planRemoval(db, client, planArgs);
  if (plan.toMark.length === 0) {
    return { marked: [], skipped: plan.skippedForOvershoot };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + leavingDays);
  rotationRemovalQueries.markMoviesAsLeaving(
    db,
    plan.toMark.map((m) => m.id),
    expiresAt.toISOString()
  );
  return { marked: plan.toMark, skipped: plan.skippedForOvershoot };
}

async function reCheckFreeSpace(
  client: RadarrClient,
  rootFolderPath: string,
  fallbackGb: number
): Promise<number> {
  try {
    return await getRadarrDiskSpace(client, rootFolderPath);
  } catch {
    return fallbackGb;
  }
}

type VolumeMeasurement =
  | { freeSpaceGb: number; rootFolderPath: string; skippedReason: null }
  | { freeSpaceGb: null; rootFolderPath: null; skippedReason: string };

/**
 * Free space on the volume the library lives on, or the reason the cycle
 * cannot know it. Measuring the wrong volume is worse than not measuring:
 * deletions would never move the reading, so the target could never be met.
 */
async function measureLibraryVolume(
  client: RadarrClient,
  rootFolderPath: string | null
): Promise<VolumeMeasurement> {
  if (rootFolderPath === null) {
    return {
      freeSpaceGb: null,
      rootFolderPath: null,
      skippedReason: 'Radarr root folder not configured — cannot identify the library volume',
    };
  }
  try {
    return {
      freeSpaceGb: await getRadarrDiskSpace(client, rootFolderPath),
      rootFolderPath,
      skippedReason: null,
    };
  } catch (err) {
    return {
      freeSpaceGb: null,
      rootFolderPath: null,
      skippedReason:
        err instanceof RotationDiskSelectionError
          ? err.message
          : 'Radarr unavailable — cannot measure disk space',
    };
  }
}

/**
 * What the next cycle's removal phase would do, without doing any of it.
 *
 * Shares {@link planRemoval} with {@link executeRotationCycle} so the preview
 * cannot drift from the engine: a preview that models the cycle rather than
 * running its planner is worth very little. `plan` is null exactly when a real
 * cycle would have skipped, and `skippedReason` says why.
 */
export async function previewRemoval(db: MediaDb): Promise<RemovalPreview> {
  const policy = getRotationCyclePolicy(db);
  const client = getRadarrClient(db);
  if (!client) return { plan: null, skippedReason: 'Radarr not configured' };

  const measured = await measureLibraryVolume(client, getRadarrRootFolderPath(db));
  if (measured.freeSpaceGb === null) {
    return { plan: null, skippedReason: measured.skippedReason };
  }

  const { sizes: movieSizes, acquiredAt } = await getRadarrMovieFacts(client);
  const plan = await planRemoval(db, client, {
    freeSpaceGb: measured.freeSpaceGb,
    targetFreeGb: policy.targetFreeGb,
    graceDays: policy.protectedDays,
    movieSizes,
    acquiredAt,
  });
  return { plan, skippedReason: null };
}

/**
 * Run a single rotation cycle. A missing Radarr client (after the expiry
 * sweep) short-circuits to a skipped result that still reflects the removals.
 */
export async function executeRotationCycle(db: MediaDb): Promise<RotationCycleResult> {
  const policy = getRotationCyclePolicy(db);
  const { targetFreeGb, leavingDays } = policy;

  await syncAllSources(db);

  const client = getRadarrClient(db);
  if (!client) {
    return { ...emptyResult(targetFreeGb), skippedReason: 'Radarr not configured' };
  }

  const expired = await processExpiredMovies(db, client);
  const afterSweep = {
    moviesRemoved: expired.removed.length,
    removalsFailed: expired.failed.length,
    removed: expired.removed,
    failed: expired.failed,
  };

  const measured = await measureLibraryVolume(client, getRadarrRootFolderPath(db));
  if (measured.freeSpaceGb === null) {
    return { ...emptyResult(targetFreeGb), ...afterSweep, skippedReason: measured.skippedReason };
  }
  const { freeSpaceGb, rootFolderPath } = measured;

  const { sizes: movieSizes, acquiredAt } = await getRadarrMovieFacts(client);
  const marked = await markLeaving(db, client, {
    freeSpaceGb,
    targetFreeGb,
    leavingDays,
    graceDays: policy.protectedDays,
    movieSizes,
    acquiredAt,
  });

  const postFreeSpaceGb = await reCheckFreeSpace(client, rootFolderPath, freeSpaceGb);
  const budget = getAdditionBudget(
    postFreeSpaceGb,
    targetFreeGb,
    policy.avgMovieGb,
    policy.dailyAdditions
  );
  const additions = await addMoviesFromQueue(db, budget, new Set(movieSizes.keys()));

  return {
    ...emptyResult(targetFreeGb),
    ...afterSweep,
    moviesMarkedLeaving: marked.marked.length,
    moviesAdded: additions.added,
    freeSpaceGb,
    marked: marked.marked,
    skippedForOvershoot: marked.skipped,
    added: additions.addedMovies,
  };
}
