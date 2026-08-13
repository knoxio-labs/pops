import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { preMigrationBackupPath, withPreMigrationBackup } from '../pre-migration-backup.js';
import {
  openTestDatabase,
  recordAppliedMigrations,
  type TestConnection,
} from './sqlite-harness.js';

import type { SqliteConnection } from '../connection.js';

const ENTRIES = [
  { idx: 0, version: '6', when: 1000, tag: '0000_init', breakpoints: true },
  { idx: 1, version: '6', when: 2000, tag: '0001_add_column', breakpoints: true },
];

const AT = new Date('2026-08-13T04:05:06.007Z');

let dir: string;
let dbPath: string;
let migrationsFolder: string;
let connection: TestConnection;
const logged: string[] = [];

function log(message: string): void {
  logged.push(message);
}

function writeJournal(entries: readonly unknown[]): void {
  migrationsFolder = join(dir, 'migrations');
  mkdirSync(join(migrationsFolder, 'meta'), { recursive: true });
  writeFileSync(
    join(migrationsFolder, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries })
  );
}

/** A populated database: one applied migration, and rows that must survive. */
function seedPopulatedDatabase(): void {
  connection.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  connection.prepare('INSERT INTO notes (id, body) VALUES (?, ?)').run(1, 'keep me');
  recordAppliedMigrations(connection, [1000]);
}

function backups(): string[] {
  return readdirSync(dir).filter((name) => name.includes('.pre-migration-'));
}

beforeEach(() => {
  logged.length = 0;
  dir = mkdtempSync(join(tmpdir(), 'sdk-backup-'));
  dbPath = join(dir, 'pillar.db');
  connection = openTestDatabase(dbPath);
  writeJournal(ENTRIES);
});

afterEach(() => {
  connection.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('a pending migration against a populated database', () => {
  it('takes a snapshot that exists while the migration is running', () => {
    seedPopulatedDatabase();
    let seenDuringApply: string[] = [];

    const { outcome } = withPreMigrationBackup(
      { connection, databasePath: dbPath, migrationsFolder, now: () => AT, log },
      () => {
        seenDuringApply = backups();
        return 'applied';
      }
    );

    expect(seenDuringApply).toEqual([`pillar.db.pre-migration-2026-08-13T04-05-06-007Z.bak`]);
    expect(outcome.backupPath).toBe(preMigrationBackupPath(dbPath, AT));
    expect(outcome.pending.map((entry) => entry.tag)).toEqual(['0001_add_column']);
  });

  it('removes the snapshot once every migration lands', () => {
    seedPopulatedDatabase();
    withPreMigrationBackup(
      { connection, databasePath: dbPath, migrationsFolder, now: () => AT, log },
      () => undefined
    );
    expect(backups()).toEqual([]);
    expect(logged).toEqual([
      '[db] Backing up before applying 1 migration(s)...',
      '[db] All migrations applied. Backup removed.',
    ]);
  });

  it('preserves the snapshot and logs its path when the migration throws', () => {
    seedPopulatedDatabase();
    const boom = new Error('near "ALTER": syntax error');

    expect(() =>
      withPreMigrationBackup(
        { connection, databasePath: dbPath, migrationsFolder, now: () => AT, log },
        () => {
          throw boom;
        }
      )
    ).toThrow(boom);

    expect(backups()).toEqual([`pillar.db.pre-migration-2026-08-13T04-05-06-007Z.bak`]);
    expect(logged.at(-1)).toBe(
      `[db] Migration failed. Backup preserved at ${preMigrationBackupPath(dbPath, AT)}`
    );
  });

  it('leaves a snapshot that still holds the rows the failed migration deleted', () => {
    seedPopulatedDatabase();

    expect(() =>
      withPreMigrationBackup(
        { connection, databasePath: dbPath, migrationsFolder, now: () => AT, log },
        () => {
          connection.exec('DELETE FROM notes');
          throw new Error('failed after the destructive statement');
        }
      )
    ).toThrow();

    const live = connection.prepare('SELECT count(*) AS n FROM notes').get() as { n: number };
    expect(live.n).toBe(0);

    const preserved = openTestDatabase(preMigrationBackupPath(dbPath, AT));
    const rows = preserved.prepare('SELECT body FROM notes').all() as { body: string }[];
    preserved.close();
    expect(rows.map((row) => row.body)).toEqual(['keep me']);
  });
});

describe('the cases that must not cost a snapshot', () => {
  it('skips when the journal has nothing pending', () => {
    seedPopulatedDatabase();
    recordAppliedMigrations(connection, [2000]);

    const { outcome } = withPreMigrationBackup(
      { connection, databasePath: dbPath, migrationsFolder, now: () => AT, log },
      () => 'applied'
    );

    expect(outcome.backupPath).toBeUndefined();
    expect(backups()).toEqual([]);
    expect(logged).toEqual([]);
  });

  it('skips on the first-ever mount of a pillar data volume', () => {
    // Nothing but the journal exists: no schema, no rows, nothing to lose.
    // Snapshotting here would write a second file per boot and turn a
    // not-yet-writable data directory into a boot failure.
    const { outcome } = withPreMigrationBackup(
      { connection, databasePath: dbPath, migrationsFolder, now: () => AT, log },
      () => 'applied'
    );

    expect(outcome.pending).toHaveLength(2);
    expect(outcome.backupPath).toBeUndefined();
    expect(backups()).toEqual([]);
  });

  it('skips an in-memory database', () => {
    const memory = openTestDatabase(':memory:');
    memory.exec('CREATE TABLE t (a INTEGER)');
    memory.prepare('INSERT INTO t VALUES (1)').run();

    const { outcome } = withPreMigrationBackup(
      { connection: memory, databasePath: ':memory:', migrationsFolder, now: () => AT, log },
      () => 'applied'
    );
    memory.close();

    expect(outcome.backupPath).toBeUndefined();
    expect(existsSync(':memory:.pre-migration-2026-08-13T04-05-06-007Z.bak')).toBe(false);
  });
});

describe('when VACUUM INTO cannot run', () => {
  it('falls back to a checkpoint and a file copy', () => {
    seedPopulatedDatabase();
    const older: SqliteConnection = {
      prepare: (sql) => connection.prepare(sql),
      exec: (sql) => {
        if (sql.startsWith('VACUUM INTO')) throw new Error('near "INTO": syntax error');
        return connection.exec(sql);
      },
      pragma: (statement) => connection.pragma(statement),
    };

    const { outcome } = withPreMigrationBackup(
      { connection: older, databasePath: dbPath, migrationsFolder, now: () => AT, log },
      () => 'applied'
    );

    expect(outcome.method).toBe('checkpoint-copy');
  });

  it('refuses to migrate at all when no snapshot can be written', () => {
    seedPopulatedDatabase();
    const apply = vi.fn();
    const unwritable = join(dir, 'no', 'such', 'dir', 'pillar.db');

    expect(() =>
      withPreMigrationBackup(
        { connection, databasePath: unwritable, migrationsFolder, now: () => AT, log },
        apply
      )
    ).toThrow(/refusing to migrate/);

    // The whole point: an un-snapshottable populated database is not migrated
    // on a hope. Nothing ran.
    expect(apply).not.toHaveBeenCalled();
  });
});
