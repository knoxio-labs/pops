/**
 * What the rest of the migration chain does to cerebrum data that was
 * already there.
 *
 * Every other test in this pillar opens a database that was empty when the
 * migrations ran, so a chain that drops rows, breaks a foreign key or loses
 * a JSON column passes all of them and is discovered against the live file.
 *
 * As of this test's authoring, cerebrum's journal
 * (`migrations/meta/_journal.json`, `0039_dry_fabian_cortez` through
 * `0057_settings_baseline`) has no migration that mutates pre-existing rows —
 * every entry is a `CREATE TABLE` / `CREATE INDEX`, several guarded with
 * `IF NOT EXISTS`. There is no rename, backfill or table rebuild for this
 * test to pin. What it proves today is narrower: reopening a populated
 * database through the remaining pure-additive tail — including the one
 * migration still ahead of the seed, `0057_settings_baseline` — does not
 * touch a single row of data that was already on disk. The moment a
 * data-mutating migration lands after the baseline tag below, moving that
 * tag forward to the entry just before it will bring this test back onto the
 * thing it is meant to guard.
 *
 * The shape: bring a database up to `0056_reflex_executions_baseline` from a
 * truncated journal, write representative rows through raw SQL, then reopen
 * it with the real opener, which applies `0057_settings_baseline`.
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

import { openCerebrumDb } from '../open-cerebrum-db.js';

import type { OpenedCerebrumDb } from '../open-cerebrum-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The last entry before `0057_settings_baseline`, the only one still pending. */
const BASELINE_TAG = '0056_reflex_executions_baseline';

interface SeededEngram {
  readonly id: string;
  readonly filePath: string;
  readonly title: string;
  readonly customFields: Record<string, unknown> | null;
}

/** Two engrams: one carrying a JSON `custom_fields` blob, one with none. */
const ENGRAMS: readonly SeededEngram[] = [
  {
    id: 'eng_20260601_1000_kitchen',
    filePath: 'notes/eng_20260601_1000_kitchen.md',
    title: 'Kitchen renovation notes',
    customFields: { room: 'kitchen', budgetCents: 850000, tags: ['reno', 'q3'] },
  },
  {
    id: 'eng_20260601_1100_garage',
    filePath: 'notes/eng_20260601_1100_garage.md',
    title: 'Garage cleanup follow-up',
    customFields: null,
  },
];

const CONVERSATION_ID = 'conv-2026-06-planning';

let dir: string;
let dbPath: string;
let opened: OpenedCerebrumDb;

function seedThroughBaseline(): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(dir, 'staged-migrations'),
  });

  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });

  for (const engram of ENGRAMS) {
    raw
      .prepare(
        `INSERT INTO engram_index
           (id, file_path, type, source, status, created_at, modified_at, title,
            content_hash, word_count, custom_fields)
         VALUES (?, ?, 'note', 'manual', 'active', '2026-06-01T10:00:00Z',
                 '2026-06-01T10:00:00Z', ?, ?, 42, ?)`
      )
      .run(
        engram.id,
        engram.filePath,
        engram.title,
        `hash-${engram.id}`,
        engram.customFields === null ? null : JSON.stringify(engram.customFields)
      );
  }

  raw
    .prepare(`INSERT INTO engram_tags (engram_id, tag) VALUES (?, 'reno'), (?, 'q3')`)
    .run(ENGRAMS[0]?.id, ENGRAMS[0]?.id);
  raw
    .prepare(`INSERT INTO engram_scopes (engram_id, scope) VALUES (?, 'home')`)
    .run(ENGRAMS[0]?.id);
  raw
    .prepare(`INSERT INTO engram_links (source_id, target_id) VALUES (?, ?)`)
    .run(ENGRAMS[0]?.id, ENGRAMS[1]?.id);

  raw
    .prepare(
      `INSERT INTO nudge_log
         (id, type, title, body, engram_ids, priority, status, created_at)
       VALUES ('n-kitchen-followup', 'pattern', 'Kitchen budget check-in',
               'Renovation notes have not been revisited in 30 days.', ?,
               'medium', 'pending', '2026-06-02T09:00:00Z')`
    )
    .run(JSON.stringify([ENGRAMS[0]?.id]));

  raw
    .prepare(
      `INSERT INTO conversations (id, title, active_scopes, model, created_at, updated_at)
       VALUES (?, 'Kitchen planning', ?, 'claude-sonnet', '2026-06-01T10:05:00Z',
               '2026-06-01T10:07:00Z')`
    )
    .run(CONVERSATION_ID, JSON.stringify(['home']));

  raw
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, 'user', 'What is left on the kitchen list?', '2026-06-01T10:05:00Z')`
    )
    .run('msg-1', CONVERSATION_ID);
  raw
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, 'assistant', 'Cabinet hardware and the tile order.', '2026-06-01T10:05:30Z')`
    )
    .run('msg-2', CONVERSATION_ID);

  raw
    .prepare(
      `INSERT INTO conversation_context (conversation_id, engram_id, relevance_score, loaded_at)
       VALUES (?, ?, 0.92, '2026-06-01T10:05:00Z')`
    )
    .run(CONVERSATION_ID, ENGRAMS[0]?.id);

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cerebrum-migration-safety-'));
  dbPath = join(dir, 'cerebrum.db');
  seedThroughBaseline();
  opened = openCerebrumDb(dbPath, { loadVec: false });
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying the rest of the journal to a populated cerebrum database', () => {
  it('applies every remaining entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('loses no rows from any seeded table', () => {
    expect(count('engram_index')).toBe(ENGRAMS.length);
    expect(count('engram_tags')).toBe(2);
    expect(count('engram_scopes')).toBe(1);
    expect(count('engram_links')).toBe(1);
    expect(count('nudge_log')).toBe(1);
    expect(count('conversations')).toBe(1);
    expect(count('messages')).toBe(2);
    expect(count('conversation_context')).toBe(1);
  });

  it('creates the table the tail migration was for', () => {
    const table = opened.raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'`)
      .get();
    expect(table).toBeDefined();
    expect(() => opened.raw.prepare(`SELECT * FROM settings`).all()).not.toThrow();
  });

  it('leaves the pre-migration snapshot behind only if it failed', () => {
    // It did not fail — the reopen above returned. The directory holding the
    // database must therefore be back to just the database and its WAL.
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('leaves every JSON column parseable and unchanged', () => {
    const stored = rows<{ id: string; custom_fields: string | null }>(
      `SELECT id, custom_fields FROM engram_index ORDER BY id`
    );
    for (const row of stored) {
      const seeded = ENGRAMS.find((candidate) => candidate.id === row.id);
      if (seeded?.customFields === null) {
        expect(row.custom_fields).toBeNull();
      } else {
        expect(() => JSON.parse(row.custom_fields ?? '') as unknown).not.toThrow();
        expect(JSON.parse(row.custom_fields ?? '')).toEqual(seeded?.customFields);
      }
    }

    const nudge = rows<{ engram_ids: string }>(
      `SELECT engram_ids FROM nudge_log WHERE id = 'n-kitchen-followup'`
    )[0];
    expect(JSON.parse(nudge?.engram_ids ?? '')).toEqual([ENGRAMS[0]?.id]);
  });

  it('keeps every non-JSON column intact', () => {
    const stored = rows<{ id: string; file_path: string; title: string; word_count: number }>(
      `SELECT id, file_path, title, word_count FROM engram_index ORDER BY id`
    );
    expect(stored).toEqual(
      ENGRAMS.map((engram) => ({
        id: engram.id,
        file_path: engram.filePath,
        title: engram.title,
        word_count: 42,
      }))
    );
  });

  it('leaves no broken foreign key anywhere in the database', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });

  it('keeps every engram child row attached to its parent', () => {
    const tags = rows<{ engram_id: string; tag: string }>(
      `SELECT engram_id, tag FROM engram_tags ORDER BY tag`
    );
    expect(tags).toEqual([
      { engram_id: ENGRAMS[0]?.id, tag: 'q3' },
      { engram_id: ENGRAMS[0]?.id, tag: 'reno' },
    ]);

    const link = rows<{ source_id: string; target_id: string }>(
      `SELECT source_id, target_id FROM engram_links`
    )[0];
    expect(link).toEqual({ source_id: ENGRAMS[0]?.id, target_id: ENGRAMS[1]?.id });
  });

  it('keeps every message attached to its conversation, in order', () => {
    const stored = opened.raw
      .prepare(
        `SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY created_at`
      )
      .all(CONVERSATION_ID) as { id: string; role: string; content: string }[];
    expect(stored).toEqual([
      { id: 'msg-1', role: 'user', content: 'What is left on the kitchen list?' },
      { id: 'msg-2', role: 'assistant', content: 'Cabinet hardware and the tile order.' },
    ]);
  });

  it('keeps the conversation context link to its engram', () => {
    const stored = rows<{ conversation_id: string; engram_id: string; relevance_score: number }>(
      `SELECT conversation_id, engram_id, relevance_score FROM conversation_context`
    )[0];
    expect(stored).toEqual({
      conversation_id: CONVERSATION_ID,
      engram_id: ENGRAMS[0]?.id,
      relevance_score: 0.92,
    });
  });
});
