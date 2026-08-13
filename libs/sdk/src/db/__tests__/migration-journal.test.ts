import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isEmptyDatabase, isInMemoryDatabasePath } from '../connection.js';
import {
  lastAppliedMigrationAt,
  pendingMigrations,
  readMigrationJournal,
} from '../migration-journal.js';
import {
  openTestDatabase,
  recordAppliedMigrations,
  type TestConnection,
} from './sqlite-harness.js';

const ENTRIES = [
  { idx: 0, version: '6', when: 1000, tag: '0000_init', breakpoints: true },
  { idx: 1, version: '6', when: 2000, tag: '0001_add_column', breakpoints: true },
  { idx: 2, version: '6', when: 3000, tag: '0002_backfill', breakpoints: true },
];

let dir: string;
let connection: TestConnection;

function writeJournal(entries: readonly unknown[]): string {
  const folder = join(dir, 'migrations');
  mkdirSync(join(folder, 'meta'), { recursive: true });
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries })
  );
  return folder;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sdk-journal-'));
  connection = openTestDatabase(':memory:');
});

afterEach(() => {
  connection.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('readMigrationJournal', () => {
  it('returns entries oldest first, keeping the fields drizzle reads', () => {
    const folder = writeJournal([ENTRIES[2], ENTRIES[0], ENTRIES[1]]);
    expect(readMigrationJournal(folder)).toEqual(ENTRIES);
  });

  it('throws on a journal missing the timestamp the migrator orders by', () => {
    const folder = writeJournal([{ idx: 0, tag: '0000_init' }]);
    expect(() => readMigrationJournal(folder)).toThrow();
  });

  it('throws rather than reporting "nothing pending" when the folder is absent', () => {
    expect(() => readMigrationJournal(join(dir, 'nowhere'))).toThrow();
  });
});

describe('pendingMigrations', () => {
  it('reports every entry against a database drizzle has never touched', () => {
    const folder = writeJournal(ENTRIES);
    expect(pendingMigrations(connection, folder).map((entry) => entry.tag)).toEqual([
      '0000_init',
      '0001_add_column',
      '0002_backfill',
    ]);
  });

  it('reports only entries newer than the newest recorded one', () => {
    const folder = writeJournal(ENTRIES);
    recordAppliedMigrations(connection, [1000, 2000]);
    expect(pendingMigrations(connection, folder).map((entry) => entry.tag)).toEqual([
      '0002_backfill',
    ]);
  });

  it('treats an entry whose timestamp equals the recorded one as applied', () => {
    // drizzle applies on `recorded < when`, so an off-by-one here would take a
    // snapshot on every single restart of an up-to-date pillar.
    const folder = writeJournal(ENTRIES);
    recordAppliedMigrations(connection, [3000]);
    expect(pendingMigrations(connection, folder)).toEqual([]);
  });

  it('reports every entry when the bookkeeping table exists but is empty', () => {
    const folder = writeJournal(ENTRIES);
    recordAppliedMigrations(connection, []);
    expect(pendingMigrations(connection, folder)).toHaveLength(3);
  });
});

describe('lastAppliedMigrationAt', () => {
  it('is undefined before drizzle has ever run', () => {
    expect(lastAppliedMigrationAt(connection)).toBeUndefined();
  });

  it('reads the newest timestamp regardless of insertion order', () => {
    recordAppliedMigrations(connection, [3000, 1000, 2000]);
    expect(lastAppliedMigrationAt(connection)).toBe(3000);
  });
});

describe('isEmptyDatabase', () => {
  it('is true for a file that only SQLite and drizzle have written to', () => {
    recordAppliedMigrations(connection, [1000]);
    expect(isEmptyDatabase(connection)).toBe(true);
  });

  it('is false once the schema owns a table', () => {
    connection.exec('CREATE TABLE transactions (id TEXT PRIMARY KEY)');
    expect(isEmptyDatabase(connection)).toBe(false);
  });
});

describe('isInMemoryDatabasePath', () => {
  it.each([':memory:', '', 'file:x?mode=memory&cache=shared'])('recognises %j', (path) => {
    expect(isInMemoryDatabasePath(path)).toBe(true);
  });

  it('does not mistake a real path for one', () => {
    expect(isInMemoryDatabasePath('/data/sqlite/finance.db')).toBe(false);
  });
});
