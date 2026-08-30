/**
 * Rotation candidate queries against the media pillar's SQLite via drizzle.
 *
 * HTTP-free; services take a `MediaDb` handle first and raise the rotation
 * domain errors from `../../errors.js` (mapped to HTTP at the handler layer).
 * Ported from the monolith `rotation-candidates-router.ts` + the manual-queue
 * insert path.
 */
import { and, count, desc, eq, like } from 'drizzle-orm';

import { RotationMovieExcludedError } from '../../errors.js';
import { rotationCandidates, rotationExclusions, rotationSources } from '../../schema.js';

import type { MediaDb } from '../internal.js';

export type RotationCandidateRow = typeof rotationCandidates.$inferSelect;

/** The candidate statuses the wire surface accepts as a list filter. */
export type CandidateStatus = 'pending' | 'added' | 'skipped' | 'excluded';

export interface AddToQueueInput {
  tmdbId: number;
  title: string;
  year?: number | null;
  rating?: number | null;
  posterPath?: string | null;
}

export interface CandidateStatusResult {
  inQueue: boolean;
  candidateId: number | null;
  candidateStatus: string | null;
  isExcluded: boolean;
}

export interface ListCandidatesInput {
  status?: CandidateStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

/** A candidate row decorated with its source's name + priority. */
export interface CandidateListRow {
  id: number;
  sourceId: number;
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
  status: string;
  discoveredAt: string;
  sourceName: string | null;
  sourcePriority: number | null;
}

export interface ListCandidatesResult {
  items: CandidateListRow[];
  total: number;
}

/** Find (or lazily create) the singleton manual rotation source. */
function ensureManualSource(db: MediaDb): typeof rotationSources.$inferSelect {
  const existing = db
    .select()
    .from(rotationSources)
    .where(eq(rotationSources.type, 'manual'))
    .get();
  if (existing) return existing;
  return db
    .insert(rotationSources)
    .values({ type: 'manual', name: 'Manual Queue', priority: 5, enabled: 1 })
    .returning()
    .get();
}

/**
 * Add a movie to the rotation queue under the manual source. Returns `true`
 * when a candidate row was actually created.
 *
 * Throws {@link RotationMovieExcludedError} when the movie is on the exclusion
 * list. `rotation_candidates` carries a unique index on `tmdb_id`, so a movie
 * that already has a row of any status — including one left at `added` from a
 * download — collides and nothing is written. Reporting that rather than
 * swallowing it is what stops the caller believing it queued something it did
 * not (POPS-2720).
 */
export function addToQueue(db: MediaDb, input: AddToQueueInput): boolean {
  return db.transaction((tx) => {
    const excluded = tx
      .select({ id: rotationExclusions.id })
      .from(rotationExclusions)
      .where(eq(rotationExclusions.tmdbId, input.tmdbId))
      .get();
    if (excluded) throw new RotationMovieExcludedError(input.tmdbId);

    const manualSource = ensureManualSource(tx);
    const result = tx
      .insert(rotationCandidates)
      .values({
        sourceId: manualSource.id,
        tmdbId: input.tmdbId,
        title: input.title,
        year: input.year ?? null,
        rating: input.rating ?? null,
        posterPath: input.posterPath ?? null,
        status: 'pending',
      })
      .onConflictDoNothing()
      .run();
    return result.changes > 0;
  });
}

/** Candidate + exclusion status snapshot for a movie. */
export function getCandidateStatus(db: MediaDb, tmdbId: number): CandidateStatusResult {
  const candidate = db
    .select({ status: rotationCandidates.status, id: rotationCandidates.id })
    .from(rotationCandidates)
    .where(eq(rotationCandidates.tmdbId, tmdbId))
    .get();
  const excluded = db
    .select({ id: rotationExclusions.id })
    .from(rotationExclusions)
    .where(eq(rotationExclusions.tmdbId, tmdbId))
    .get();
  return {
    inQueue: candidate?.status === 'pending',
    candidateId: candidate?.id ?? null,
    candidateStatus: candidate?.status ?? null,
    isExcluded: !!excluded,
  };
}

/** Remove a pending candidate by tmdbId. Returns true when a row was deleted. */
export function removeFromQueue(db: MediaDb, tmdbId: number): boolean {
  const result = db
    .delete(rotationCandidates)
    .where(and(eq(rotationCandidates.tmdbId, tmdbId), eq(rotationCandidates.status, 'pending')))
    .run();
  return result.changes > 0;
}

/**
 * Drop a movie's candidate row entirely, whatever its status, once its file has
 * been removed from disk.
 *
 * The row is a record of what the engine has already acted on, and the unique
 * index on `tmdb_id` means it blocks every later insert for that movie — so a
 * row left at `added` makes a rotated-out movie permanently un-queueable, by
 * hand or by a source sync (POPS-2720). Rotation is a revolving door; clearing
 * the row is what lets it revolve.
 *
 * This restores eligibility, it does not re-queue: the movie has to be
 * re-discovered by a source or added by hand. `rotation_exclusions` remains the
 * explicit "never again" control, and is deliberately untouched here.
 */
export function forgetCandidate(db: MediaDb, tmdbId: number): boolean {
  const result = db.delete(rotationCandidates).where(eq(rotationCandidates.tmdbId, tmdbId)).run();
  return result.changes > 0;
}

/** List candidates with a status filter, optional title search, and pagination. */
export function listCandidates(db: MediaDb, input: ListCandidatesInput): ListCandidatesResult {
  const status = input.status ?? 'pending';
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;

  const statusFilter = eq(rotationCandidates.status, status);
  const whereClause = input.search
    ? and(statusFilter, like(rotationCandidates.title, `%${input.search}%`))
    : statusFilter;

  const items = db
    .select({
      id: rotationCandidates.id,
      sourceId: rotationCandidates.sourceId,
      tmdbId: rotationCandidates.tmdbId,
      title: rotationCandidates.title,
      year: rotationCandidates.year,
      rating: rotationCandidates.rating,
      posterPath: rotationCandidates.posterPath,
      status: rotationCandidates.status,
      discoveredAt: rotationCandidates.discoveredAt,
      sourceName: rotationSources.name,
      sourcePriority: rotationSources.priority,
    })
    .from(rotationCandidates)
    .leftJoin(rotationSources, eq(rotationCandidates.sourceId, rotationSources.id))
    .where(whereClause)
    .orderBy(desc(rotationCandidates.discoveredAt))
    .limit(limit)
    .offset(offset)
    .all();

  const totalRow = db.select({ value: count() }).from(rotationCandidates).where(whereClause).get();

  return { items, total: totalRow?.value ?? 0 };
}
