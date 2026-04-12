/**
 * Addition gating service — gates movie additions on available disk space.
 *
 * After removals and leaving marks, the cycle re-checks free space. Additions
 * from the candidate queue only proceed when there is enough room.
 *
 * PRD-070 US-05
 */
import { eq, asc } from 'drizzle-orm';
import { settings, rotationCandidates } from '@pops/db-types';
import { getDrizzle } from '../../../db.js';
import { getRadarrClient } from '../arr/service.js';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTINGS_KEYS = {
  dailyAdditions: 'rotation_daily_additions',
  avgMovieGb: 'rotation_avg_movie_gb',
  qualityProfileId: 'rotation_quality_profile_id',
  rootFolderPath: 'rotation_root_folder_path',
} as const;

const DEFAULT_DAILY_ADDITIONS = 2;
const DEFAULT_AVG_MOVIE_GB = 15;

function getSetting(key: string): string | null {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, key)).get();
  return record?.value ?? null;
}

export function getDailyAdditions(): number {
  const val = getSetting(SETTINGS_KEYS.dailyAdditions);
  return val ? Number(val) : DEFAULT_DAILY_ADDITIONS;
}

export function getAvgMovieGb(): number {
  const val = getSetting(SETTINGS_KEYS.avgMovieGb);
  return val ? Number(val) : DEFAULT_AVG_MOVIE_GB;
}

// ---------------------------------------------------------------------------
// Budget calculation (pure)
// ---------------------------------------------------------------------------

/**
 * Calculate how many movies can be added without dropping below the target.
 *
 * Returns 0 if free space is already below target.
 * Otherwise returns min(dailyAdditions, floor((freeSpace - target) / avgMovieGb)).
 */
export function getAdditionBudget(
  freeSpaceGb: number,
  targetFreeGb: number,
  avgMovieGb: number,
  dailyAdditions: number
): number {
  if (freeSpaceGb < targetFreeGb) return 0;
  if (avgMovieGb <= 0) return 0;
  const headroom = freeSpaceGb - targetFreeGb;
  const maxBySpace = Math.floor(headroom / avgMovieGb);
  return Math.min(dailyAdditions, maxBySpace);
}

// ---------------------------------------------------------------------------
// Queue processing
// ---------------------------------------------------------------------------

export interface AdditionResult {
  added: number;
  skippedReason: string | null;
}

/**
 * Pull up to `budget` pending candidates from the queue and add them to
 * Radarr. Updates candidate status to 'added' on success or 'skipped' on
 * failure.
 *
 * Returns the number of movies successfully added.
 */
export async function addMoviesFromQueue(budget: number): Promise<AdditionResult> {
  if (budget <= 0) {
    return { added: 0, skippedReason: 'additions skipped — below target free space' };
  }

  const client = getRadarrClient();
  if (!client) {
    return { added: 0, skippedReason: 'Radarr not configured — cannot add movies' };
  }

  const qualityProfileId = getSetting(SETTINGS_KEYS.qualityProfileId);
  const rootFolderPath = getSetting(SETTINGS_KEYS.rootFolderPath);

  if (!qualityProfileId || !rootFolderPath) {
    return {
      added: 0,
      skippedReason: 'rotation_quality_profile_id or rotation_root_folder_path not configured',
    };
  }

  const db = getDrizzle();
  const candidates = db
    .select()
    .from(rotationCandidates)
    .where(eq(rotationCandidates.status, 'pending'))
    .orderBy(asc(rotationCandidates.discoveredAt))
    .limit(budget)
    .all();

  let added = 0;
  for (const candidate of candidates) {
    try {
      // Check if already in Radarr
      const check = await client.checkMovie(candidate.tmdbId);
      if (check.exists) {
        db.update(rotationCandidates)
          .set({ status: 'skipped' })
          .where(eq(rotationCandidates.id, candidate.id))
          .run();
        continue;
      }

      await client.addMovie({
        tmdbId: candidate.tmdbId,
        title: candidate.title,
        year: candidate.year ?? new Date().getFullYear(),
        qualityProfileId: Number(qualityProfileId),
        rootFolderPath,
      });

      db.update(rotationCandidates)
        .set({ status: 'added' })
        .where(eq(rotationCandidates.id, candidate.id))
        .run();
      added++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[Rotation] Failed to add candidate ${candidate.title} (tmdb=${candidate.tmdbId}):`,
        message
      );
      db.update(rotationCandidates)
        .set({ status: 'skipped' })
        .where(eq(rotationCandidates.id, candidate.id))
        .run();
    }
  }

  return { added, skippedReason: null };
}
