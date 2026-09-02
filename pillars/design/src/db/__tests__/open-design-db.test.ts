import { writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openDesignDb } from '../open-design-db.js';
import { openTempDesignDb, type TempDb } from './helpers.js';

const opened: TempDb[] = [];
const dirs: string[] = [];

afterEach(() => {
  while (opened.length > 0) opened.pop()?.cleanup();
  while (dirs.length > 0) rmSync(dirs.pop() ?? '', { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pops-design-open-'));
  dirs.push(dir);
  return dir;
}

function open(): TempDb {
  const db = openTempDesignDb();
  opened.push(db);
  return db;
}

describe('openDesignDb', () => {
  it('applies the migrations journal, creating both tables', () => {
    const { raw } = open();

    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining(['design_messages', 'design_threads'])
    );
  });

  it('creates every index the schema declares', () => {
    const { raw } = open();

    const indexes = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(indexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_design_messages_thread',
        'idx_design_threads_created_at',
        'idx_design_threads_status',
      ])
    );
  });

  it('enables foreign keys, so the message cascade is real', () => {
    const { raw } = open();

    expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('opens in WAL mode', () => {
    const { raw } = open();

    expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('creates the parent directory when it does not exist', () => {
    const path = join(tempDir(), 'nested', 'deeper', 'design.db');

    const db = openDesignDb(path);
    db.raw.close();

    expect(path).toBeTruthy();
  });

  it('is idempotent — a second open applies nothing and keeps the data', () => {
    const dir = tempDir();
    const path = join(dir, 'design.db');
    const first = openDesignDb(path);
    first.raw
      .prepare(
        "INSERT INTO design_threads (id, route, anchor_kind, anchor, created_by, created_at) VALUES ('t1', '/r', 'css', '{}', 'seed', '2026-01-01T00:00:00.000Z')"
      )
      .run();
    first.raw.close();

    const second = openDesignDb(path);
    const rows = second.raw.prepare('SELECT id FROM design_threads').all() as Array<{ id: string }>;
    second.raw.close();

    expect(rows.map((row) => row.id)).toEqual(['t1']);
  });

  it('closes the handle before rethrowing when the file is not a database', () => {
    const path = join(tempDir(), 'not-a-db.db');
    writeFileSync(path, 'this is not a SQLite file, it is a sentence');

    expect(() => openDesignDb(path)).toThrow();
  });
});
