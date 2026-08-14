/**
 * What `0032_comparisons_baseline` does to `media_scores` data that was
 * already there.
 *
 * Every other test in this pillar opens a database that was empty when the
 * migrations ran, so a rebuild that adds a foreign key the existing rows
 * can't satisfy passes all of them and is only discovered against the live
 * file (see POPS-2182). `0032` rebuilds `media_scores` to attach
 * `FOREIGN KEY (dimension_id) REFERENCES comparison_dimensions(id)`, and
 * `comparison_dimensions` is a brand-new, empty table created earlier in
 * the same file — so the rebuild has to backfill placeholder dimension rows
 * for every pre-existing `dimension_id` before it copies the data across.
 *
 * The shape: bring a database up to `0031_rotation_baseline` — the last
 * entry before `0032` — from a truncated journal, write a representative
 * `media_scores` row through raw SQL, then reopen it with the real opener,
 * which applies `0032` and the rest of the journal. The row must survive
 * with its `dimension_id` intact and `PRAGMA foreign_key_check` must come
 * back empty.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal, stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openMediaDb } from '../open-media-db.js';

import type { OpenedMediaDb } from '../open-media-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The last entry before `0032_comparisons_baseline`. */
const BASELINE_TAG = '0031_rotation_baseline';

let dir: string;
let dbPath: string;
let opened: OpenedMediaDb;

function seedThroughBaseline(): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(dir, 'staged-migrations'),
  });

  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });

  raw
    .prepare(
      `INSERT INTO media_scores
         (id, media_type, media_id, dimension_id, score, comparison_count, excluded, updated_at)
       VALUES (1, 'movie', 42, 7, 1612.5, 9, 0, '2026-01-01T00:00:00Z')`
    )
    .run();

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function single<T>(sql: string): T {
  const found = rows<T>(sql)[0];
  if (found === undefined) {
    throw new Error(`expected exactly one row from: ${sql}`);
  }
  return found;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'media-migration-safety-'));
  dbPath = join(dir, 'media.db');
  seedThroughBaseline();
  opened = openMediaDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying the rest of the journal to a populated media database', () => {
  it('applies every remaining entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('leaves no pre-migration snapshot behind', () => {
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('keeps the pre-existing media_scores row intact', () => {
    expect(count('media_scores')).toBe(1);
    const stored = single<{
      media_type: string;
      media_id: number;
      dimension_id: number;
      score: number;
      comparison_count: number;
      excluded: number;
    }>(
      `SELECT media_type, media_id, dimension_id, score, comparison_count, excluded
       FROM media_scores WHERE id = 1`
    );
    expect(stored).toEqual({
      media_type: 'movie',
      media_id: 42,
      dimension_id: 7,
      score: 1612.5,
      comparison_count: 9,
      excluded: 0,
    });
  });

  it('backfills a placeholder comparison_dimensions row for the pre-existing dimension_id', () => {
    expect(count('comparison_dimensions')).toBe(1);
    const dimension = single<{ id: number; name: string }>(
      `SELECT id, name FROM comparison_dimensions WHERE id = 7`
    );
    expect(dimension.id).toBe(7);
    expect(dimension.name).toBeTruthy();
  });

  it('leaves no broken foreign key and no corrupted page', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });
});
