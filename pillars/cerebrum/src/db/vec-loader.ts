/**
 * sqlite-vec extension loader for the cerebrum pillar database.
 *
 * The module-level `vecAvailable` flag gates the one-time info log. The
 * extension binary is loaded once per process by `sqlite-vec`; calling
 * `load` on multiple connections is safe.
 *
 * The `embeddings_vec` virtual table is cerebrum-owned and the only
 * consumer of `vec_*` SQL, so the loader stays colocated with
 * `openCerebrumDb`.
 */
import * as sqliteVec from 'sqlite-vec';

import type BetterSqlite3 from 'better-sqlite3';

let vecAvailable = false;

export function isVecAvailable(): boolean {
  return vecAvailable;
}

export interface VecLoaderLogger {
  info?: (payload: unknown, msg: string) => void;
  warn?: (payload: unknown, msg: string) => void;
}

/**
 * Try to load the sqlite-vec extension into `raw`. Returns `true` on
 * success, `false` if the extension can't be loaded (binary missing,
 * platform unsupported, etc.). Failures are non-fatal — callers that
 * need vector search should branch on the return value or surface a
 * domain-level error; non-vector consumers (engram CRUD, scopes, tags,
 * links) all work without it.
 *
 * Does not throw. Logs at most one warning per process via the optional
 * logger argument.
 */
export function tryLoadVecExtension(
  raw: BetterSqlite3.Database,
  logger?: VecLoaderLogger
): boolean {
  try {
    sqliteVec.load(raw);
    if (!vecAvailable) {
      const version = raw.prepare('SELECT vec_version()').pluck().get() as string;
      logger?.info?.({ version }, '[cerebrum-db] sqlite-vec loaded');
      vecAvailable = true;
    }
    return true;
  } catch (err) {
    if (!vecAvailable) {
      logger?.warn?.(
        { err: (err as Error).message },
        '[cerebrum-db] sqlite-vec failed to load — vector features disabled'
      );
    }
    return false;
  }
}

/** Vector width used when `EMBEDDING_DIMENSIONS` is unset (text-embedding-3-small). */
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/**
 * Resolve the embedding vector width from `EMBEDDING_DIMENSIONS`. Unset or
 * blank falls back to {@link DEFAULT_EMBEDDING_DIMENSIONS}; anything that is
 * not a positive integer throws. The `embeddings_vec` table and both embedding
 * clients read the width through here so the stored vectors and the requested
 * ones cannot disagree.
 */
export function resolveEmbeddingDimensions(env: NodeJS.ProcessEnv = process.env): number {
  const configured = env['EMBEDDING_DIMENSIONS']?.trim();
  if (!configured) return DEFAULT_EMBEDDING_DIMENSIONS;
  if (!/^[1-9]\d*$/.test(configured)) {
    throw new Error(`EMBEDDING_DIMENSIONS must be a positive integer, got "${configured}"`);
  }
  return Number.parseInt(configured, 10);
}

export type EnsureEmbeddingsVecResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'dimension-mismatch'; existing: number; requested: number };

function existingVecDimensions(raw: BetterSqlite3.Database): number | undefined {
  const sql = raw
    .prepare(`SELECT sql FROM sqlite_master WHERE name = 'embeddings_vec'`)
    .pluck()
    .get();
  if (typeof sql !== 'string') return undefined;
  const width = /float\[(\d+)\]/.exec(sql)?.[1];
  return width === undefined ? undefined : Number.parseInt(width, 10);
}

function hasStoredVectors(raw: BetterSqlite3.Database): boolean {
  return raw.prepare('SELECT 1 FROM embeddings_vec LIMIT 1').get() !== undefined;
}

/**
 * Idempotent creation of the `embeddings_vec` virtual table at `dimensions`
 * wide. Returns `unavailable` when sqlite-vec hasn't been loaded — the right
 * path for unit tests and any cerebrum-owned consumer that doesn't need vector
 * search.
 *
 * An existing table of a different width is recreated only while it holds no
 * vectors. Once it holds any, the call reports `dimension-mismatch` and leaves
 * the table alone: changing the width means re-embedding the corpus, which is
 * not a decision to take at open time.
 */
export function ensureEmbeddingsVecTable(
  raw: BetterSqlite3.Database,
  dimensions: number
): EnsureEmbeddingsVecResult {
  try {
    const existing = existingVecDimensions(raw);
    if (existing !== undefined && existing !== dimensions) {
      if (hasStoredVectors(raw)) {
        return { ok: false, reason: 'dimension-mismatch', existing, requested: dimensions };
      }
      raw.exec('DROP TABLE embeddings_vec');
    }
    raw.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS embeddings_vec USING vec0(vector float[${dimensions}])`
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
