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
  calculateRemovalDeficit,
  emptyResult,
  getAdditionBudget,
  type RotationCycleResult,
  type RotationMovieRef,
  selectForDeficit,
} from './rotation-cycle-types.js';
import { rankForRemoval } from './rotation-removal-ranking.js';
import {
  getDownloadingTmdbIds,
  getRadarrDiskSpace,
  getRadarrMovieFacts,
  type MovieAcquiredMap,
  processExpiredMovies,
  RotationDiskSelectionError,
} from './rotation-removal.js';
import { syncAllSources } from './rotation-sync-all.js';

interface MarkLeavingOutcome {
  marked: RotationMovieRef[];
  skipped: RotationMovieRef[];
}

interface MarkLeavingArgs {
  freeSpaceGb: number;
  targetFreeGb: number;
  leavingDays: number;
  graceDays: number;
  movieSizes: MovieSizeMap;
  acquiredAt: MovieAcquiredMap;
}

async function markLeaving(
  db: MediaDb,
  client: RadarrClient,
  args: MarkLeavingArgs
): Promise<MarkLeavingOutcome> {
  const { freeSpaceGb, targetFreeGb, leavingDays, graceDays, movieSizes, acquiredAt } = args;
  const leavingSizeGb = rotationRemovalQueries.getLeavingMovieSizeGb(db, movieSizes);
  const deficit = calculateRemovalDeficit(targetFreeGb, freeSpaceGb, leavingSizeGb);
  if (deficit <= 0) return { marked: [], skipped: [] };

  const downloadingIds = await getDownloadingTmdbIds(client);
  const eligible = rotationRemovalQueries.getEligibleForRemoval(db, movieSizes, downloadingIds);
  const ranked = rankForRemoval({ candidates: eligible, acquiredAt, graceDays });

  const { selected, skipped } = selectForDeficit(
    ranked,
    (movie) => movieSizes.get(movie.tmdbId) ?? 0,
    deficit
  );
  if (selected.length === 0) return { marked: [], skipped: [] };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + leavingDays);
  rotationRemovalQueries.markMoviesAsLeaving(
    db,
    selected.map((m) => m.id),
    expiresAt.toISOString()
  );
  return {
    marked: selected.map((m) => ({ tmdbId: m.tmdbId, title: m.title })),
    skipped: skipped.map((m) => ({ tmdbId: m.tmdbId, title: m.title })),
  };
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
  const additions = await addMoviesFromQueue(db, budget);

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
