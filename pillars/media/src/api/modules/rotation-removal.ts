/**
 * Radarr-backed removal helpers for the rotation cycle (api-layer).
 *
 * Wraps the resolved Radarr client: free disk space, per-movie sizes and
 * acquisition dates,
 * the active download set, and the expiry sweep that deletes `leaving` movies
 * (with files) once their window elapses and clears their POPS rotation flags.
 * Ported from the monolith `removal-selection.ts` (the Radarr parts). The pure
 * SQLite queries live in the db `removal-queries.ts` service; the pure math in
 * `rotation-cycle-types.ts`.
 */
import { type MediaDb, type MovieSizeMap, rotationRemovalQueries } from '../../db/index.js';
import { type RadarrClient, type RadarrDiskSpace } from '../clients/arr/index.js';
import {
  bytesToGb,
  type RotationFailedMovieRef,
  type RotationMovieRef,
} from './rotation-cycle-types.js';

/**
 * The cycle cannot measure the volume it is trying to free. Distinguished from
 * a transport failure so the cycle can report WHY it skipped rather than
 * blaming Radarr for being unreachable.
 */
export class RotationDiskSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RotationDiskSelectionError';
  }
}

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function containsPath(mountPath: string, target: string): boolean {
  const mount = normalizePath(mountPath);
  const path = normalizePath(target);
  if (mount === '/') return path.startsWith('/');
  return path === mount || path.startsWith(`${mount}/`);
}

/**
 * The disk whose mount point contains `rootFolderPath`, longest mount first.
 *
 * Radarr reports one entry per mounted filesystem, so `/` matches every path
 * and would win by accident on a `startsWith` scan — the deepest containing
 * mount is the volume the library actually lives on.
 */
export function selectDiskForRootFolder(
  disks: readonly RadarrDiskSpace[],
  rootFolderPath: string
): RadarrDiskSpace | null {
  let best: RadarrDiskSpace | null = null;
  for (const disk of disks) {
    if (!containsPath(disk.path, rootFolderPath)) continue;
    if (best === null || normalizePath(disk.path).length > normalizePath(best.path).length) {
      best = disk;
    }
  }
  return best;
}

/**
 * Free space in GB of the disk holding `rootFolderPath`.
 *
 * Never falls back to `disks[0]`: measuring an arbitrary volume makes the
 * free-space reading invariant under the engine's own deletions, so the target
 * can never be reached and the cycle marks a fresh batch every run. Throws
 * {@link RotationDiskSelectionError} when no mount contains the root folder.
 */
export async function getRadarrDiskSpace(
  client: RadarrClient,
  rootFolderPath: string
): Promise<number> {
  const disks = await client.getDiskSpace();
  if (disks.length === 0) throw new Error('Radarr returned no disk space info');
  const disk = selectDiskForRootFolder(disks, rootFolderPath);
  if (!disk) {
    throw new RotationDiskSelectionError(
      `No Radarr disk contains the root folder '${rootFolderPath}' (reported: ${disks
        .map((d) => d.path)
        .join(', ')})`
    );
  }
  return bytesToGb(disk.freeSpace);
}

/** Map of TMDB id → the ISO timestamp the movie was acquired. */
export type MovieAcquiredMap = Map<number, string>;

/**
 * What one `/movie` read tells the cycle: how big each file is, and when each
 * movie was acquired. Both come from the same fetch so they cannot disagree.
 */
export interface RadarrMovieFacts {
  sizes: MovieSizeMap;
  acquiredAt: MovieAcquiredMap;
}

/**
 * Sizes and acquisition dates for every Radarr movie with a file on disk.
 *
 * Acquisition is `movie.added` rather than `movieFile.dateAdded`. On the live
 * library `added` is earlier for all 676 file-bearing movies, and `dateAdded`
 * clusters in a single fortnight — the signature of a volume migration
 * re-importing pre-existing files, which resets the file's recorded date and
 * its birth time alike. `added` is the one field that migration did not touch.
 *
 * Its known error, accepted deliberately: `added` is when the movie entered
 * Radarr, not when the file arrived, so a movie added while unmonitored and
 * downloaded much later reads as older than it is.
 */
export async function getRadarrMovieFacts(client: RadarrClient): Promise<RadarrMovieFacts> {
  const radarrMovies = await client.getMovies();
  const sizes: MovieSizeMap = new Map();
  const acquiredAt: MovieAcquiredMap = new Map();
  for (const m of radarrMovies) {
    if (!m.sizeOnDisk || m.sizeOnDisk <= 0) continue;
    sizes.set(m.tmdbId, bytesToGb(m.sizeOnDisk));
    if (m.added) acquiredAt.set(m.tmdbId, m.added);
  }
  return { sizes, acquiredAt };
}

/** TMDB ids currently downloading in Radarr (queue ↔ movie-list join). */
export async function getDownloadingTmdbIds(client: RadarrClient): Promise<Set<number>> {
  const [queue, radarrMovies] = await Promise.all([client.getQueue(), client.getMovies()]);
  const radarrIdToTmdb = new Map<number, number>();
  for (const m of radarrMovies) radarrIdToTmdb.set(m.id, m.tmdbId);
  const downloading = new Set<number>();
  for (const record of queue.records) {
    const tmdbId = radarrIdToTmdb.get(record.movieId);
    if (tmdbId) downloading.add(tmdbId);
  }
  return downloading;
}

export interface ExpiredOutcome {
  removed: RotationMovieRef[];
  failed: RotationFailedMovieRef[];
}

/**
 * Delete each expired `leaving` movie from Radarr (with files) and clear its
 * POPS rotation flags. Continues on individual failures — one bad delete never
 * aborts the sweep. Returns the per-movie removed / failed lists.
 *
 * The queue is re-read here rather than trusted from the sweep that marked
 * these movies days ago: a title that started downloading again in the meantime
 * must not have its file deleted, and this is the last point at which that can
 * still be noticed. It is deliberately a second check — `getEligibleForRemoval`
 * already excludes downloading titles — because this one is irreversible.
 * When that read fails the sweep deletes nothing: an unknown queue is reported
 * as a per-movie failure, never taken as "nothing is downloading".
 */
export async function processExpiredMovies(
  db: MediaDb,
  client: RadarrClient
): Promise<ExpiredOutcome> {
  const expired = rotationRemovalQueries.getExpiredLeavingMovies(db);
  const removed: RotationMovieRef[] = [];
  const failed: RotationFailedMovieRef[] = [];
  if (expired.length === 0) return { removed, failed };

  let downloading: Set<number>;
  try {
    downloading = await getDownloadingTmdbIds(client);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(
      `[rotation] Cannot read the Radarr queue — skipping every expired removal: ${error}`
    );
    return {
      removed,
      failed: expired.map((movie) => ({ tmdbId: movie.tmdbId, title: movie.title, error })),
    };
  }

  for (const movie of expired) {
    if (downloading.has(movie.tmdbId)) {
      console.warn(
        `[rotation] Skipping expired removal of ${movie.title} (tmdb=${movie.tmdbId}) — ` +
          `it is downloading again`
      );
      continue;
    }
    try {
      const check = await client.checkMovie(movie.tmdbId);
      if (check.exists && check.radarrId != null) {
        await client.deleteMovie(check.radarrId, true);
      }
      rotationRemovalQueries.clearRotationStatus(db, movie.id);
      removed.push({ tmdbId: movie.tmdbId, title: movie.title });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(
        `[rotation] Failed to remove expired movie ${movie.title} (tmdb=${movie.tmdbId}): ${error}`
      );
      failed.push({ tmdbId: movie.tmdbId, title: movie.title, error });
    }
  }

  return { removed, failed };
}
