/** TV shows CRUD against the media pillar's SQLite via drizzle. */
import { and, asc, count, eq, like, type SQL } from 'drizzle-orm';

import { assignNullableKeys, setNullableKeys, type NullableColumnKeys } from '@pops/pillar-sdk/db';

import { TvShowConflictError, TvShowNotFoundError } from '../errors.js';
import { tvShows } from '../schema.js';

import type { MediaDb } from './internal.js';

/** Raw drizzle row shape — the persisted tv_shows record. */
export type TvShowRow = typeof tvShows.$inferSelect;

/**
 * Public alias for the persisted TV show row. The UI-side view-model
 * (poster/backdrop URL derivation, JSON-parsed genres + networks) is
 * constructed at the router boundary so this layer stays HTTP-free.
 */
export type TvShow = TvShowRow;

/** Filters accepted by {@link listTvShows}. */
export interface TvShowFilters {
  search?: string | undefined;
  status?: string | undefined;
}

/** Count + rows for a paginated list. */
export interface TvShowListResult {
  rows: TvShowRow[];
  total: number;
}

/** Mutable subset accepted on create. `genres` / `networks` default to `null`. */
export interface CreateTvShowInput {
  tvdbId: number;
  name: string;
  originalName?: string | null;
  overview?: string | null;
  firstAirDate?: string | null;
  lastAirDate?: string | null;
  status?: string | null;
  originalLanguage?: string | null;
  numberOfSeasons?: number | null;
  numberOfEpisodes?: number | null;
  episodeRunTime?: number | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  logoPath?: string | null;
  posterOverridePath?: string | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  genres?: string[];
  networks?: string[];
}

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateTvShowInput {
  tvdbId?: number;
  name?: string;
  originalName?: string | null;
  overview?: string | null;
  firstAirDate?: string | null;
  lastAirDate?: string | null;
  status?: string | null;
  originalLanguage?: string | null;
  numberOfSeasons?: number | null;
  numberOfEpisodes?: number | null;
  episodeRunTime?: number | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  logoPath?: string | null;
  posterOverridePath?: string | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  genres?: string[];
  networks?: string[];
}

type TvShowInsert = typeof tvShows.$inferInsert;
type TvShowUpdate = Partial<typeof tvShows.$inferSelect>;

const TV_SHOW_NULLABLE_INSERT_STRING_KEYS = [
  'originalName',
  'overview',
  'firstAirDate',
  'lastAirDate',
  'status',
  'originalLanguage',
  'posterPath',
  'backdropPath',
  'logoPath',
  'posterOverridePath',
] as const satisfies ReadonlyArray<NullableColumnKeys<CreateTvShowInput, TvShowInsert, string>>;

const TV_SHOW_NULLABLE_INSERT_NUMBER_KEYS = [
  'numberOfSeasons',
  'numberOfEpisodes',
  'episodeRunTime',
  'voteAverage',
  'voteCount',
] as const satisfies ReadonlyArray<NullableColumnKeys<CreateTvShowInput, TvShowInsert, number>>;

function buildTvShowInsertValues(input: CreateTvShowInput): TvShowInsert {
  const values: TvShowInsert = {
    tvdbId: input.tvdbId,
    name: input.name,
    genres: input.genres ? JSON.stringify(input.genres) : null,
    networks: input.networks ? JSON.stringify(input.networks) : null,
  };
  setNullableKeys(values, input, TV_SHOW_NULLABLE_INSERT_STRING_KEYS);
  setNullableKeys(values, input, TV_SHOW_NULLABLE_INSERT_NUMBER_KEYS);
  return values;
}

const TV_SHOW_NULLABLE_UPDATE_STRING_KEYS = [
  'originalName',
  'overview',
  'firstAirDate',
  'lastAirDate',
  'status',
  'originalLanguage',
  'posterPath',
  'backdropPath',
  'logoPath',
  'posterOverridePath',
] as const satisfies ReadonlyArray<NullableColumnKeys<UpdateTvShowInput, TvShowUpdate, string>>;

const TV_SHOW_NULLABLE_UPDATE_NUMBER_KEYS = [
  'numberOfSeasons',
  'numberOfEpisodes',
  'episodeRunTime',
  'voteAverage',
  'voteCount',
] as const satisfies ReadonlyArray<NullableColumnKeys<UpdateTvShowInput, TvShowUpdate, number>>;

function buildTvShowUpdate(input: UpdateTvShowInput): TvShowUpdate | null {
  const updates: TvShowUpdate = {};
  let touched = false;

  if (input.tvdbId !== undefined) {
    updates.tvdbId = input.tvdbId;
    touched = true;
  }
  if (input.name !== undefined) {
    updates.name = input.name;
    touched = true;
  }

  if (assignNullableKeys(updates, input, TV_SHOW_NULLABLE_UPDATE_STRING_KEYS)) touched = true;
  if (assignNullableKeys(updates, input, TV_SHOW_NULLABLE_UPDATE_NUMBER_KEYS)) touched = true;

  if (input.genres !== undefined) {
    updates.genres = JSON.stringify(input.genres);
    touched = true;
  }
  if (input.networks !== undefined) {
    updates.networks = JSON.stringify(input.networks);
    touched = true;
  }

  if (!touched) return null;
  updates.updatedAt = new Date().toISOString();
  return updates;
}

/** List TV shows with optional filters. Ordered by `name ASC`. */
export function listTvShows(
  db: MediaDb,
  filters: TvShowFilters,
  limit: number,
  offset: number
): TvShowListResult {
  const conditions: SQL[] = [];

  if (filters.search) {
    conditions.push(like(tvShows.name, `%${filters.search}%`));
  }
  if (filters.status) {
    conditions.push(eq(tvShows.status, filters.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(tvShows)
    .where(where)
    .orderBy(asc(tvShows.name))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db.select({ total: count() }).from(tvShows).where(where).all();

  return { rows, total: countRow?.total ?? 0 };
}

/** Get a single TV show by id. Throws `TvShowNotFoundError` if missing. */
export function getTvShow(db: MediaDb, id: number): TvShowRow {
  const row = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
  if (!row) throw new TvShowNotFoundError(id);
  return row;
}

/** Get a single TV show by TVDB id. Returns `null` if not found. */
export function getTvShowByTvdbId(db: MediaDb, tvdbId: number): TvShowRow | null {
  return db.select().from(tvShows).where(eq(tvShows.tvdbId, tvdbId)).get() ?? null;
}

/**
 * Create a new TV show. Returns the persisted row. Throws
 * `TvShowConflictError` when the `tvdbId` already exists (the unique index
 * raises a `UNIQUE constraint failed: tv_shows.tvdb_id` SQLITE_CONSTRAINT).
 */
export function createTvShow(db: MediaDb, input: CreateTvShowInput): TvShowRow {
  try {
    const result = db.insert(tvShows).values(buildTvShowInsertValues(input)).run();
    return getTvShow(db, Number(result.lastInsertRowid));
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new TvShowConflictError(input.tvdbId);
    }
    throw err;
  }
}

/**
 * Patch a TV show. Throws `TvShowNotFoundError` if missing. No-op writes
 * (empty `input`) still re-read the row but skip the UPDATE.
 */
export function updateTvShow(db: MediaDb, id: number, input: UpdateTvShowInput): TvShowRow {
  getTvShow(db, id);
  const updates = buildTvShowUpdate(input);
  if (updates) {
    db.update(tvShows).set(updates).where(eq(tvShows.id, id)).run();
  }
  return getTvShow(db, id);
}

/** Delete a TV show. Throws `TvShowNotFoundError` if missing. */
export function deleteTvShow(db: MediaDb, id: number): void {
  getTvShow(db, id);
  const result = db.delete(tvShows).where(eq(tvShows.id, id)).run();
  if (result.changes === 0) throw new TvShowNotFoundError(id);
}
