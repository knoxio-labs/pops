/**
 * The opener is the only thing between an empty disk and a working pillar,
 * and everything it does is a side effect — a directory, three pragmas, and
 * a migration journal. None of it is observable from a return value, so it
 * is all asserted against a real file here.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readMigrationJournal } from '@pops/pillar-sdk/db';

import { openBfmDb } from '../index.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bfm-opener-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function tableNames(raw: Database.Database): string[] {
  return (
    raw
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'
         ORDER BY name`
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
}

describe('openBfmDb', () => {
  it('creates the parent directory rather than failing on a missing one', () => {
    // The container mounts an empty volume; nothing else is going to mkdir
    // this path before the pillar boots.
    const path = join(dir, 'nested', 'deeper', 'bfm.db');
    const opened = openBfmDb(path);
    try {
      expect(existsSync(path)).toBe(true);
    } finally {
      opened.raw.close();
    }
  });

  it('applies every migration against an empty database', () => {
    const opened = openBfmDb(join(dir, 'bfm.db'));
    try {
      expect(tableNames(opened.raw)).toEqual(['devices', 'pairing_codes', 'refresh_tokens']);
    } finally {
      opened.raw.close();
    }
  });

  it('sets the pragmas the schema depends on', () => {
    const opened = openBfmDb(join(dir, 'bfm.db'));
    try {
      expect(opened.raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(opened.raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(opened.raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      opened.raw.close();
    }
  });

  it('enforces foreign keys, so an orphan token cannot be written', () => {
    // `foreign_keys = ON` is a per-connection pragma, not a property of the
    // file. Forget it and every FK in the schema becomes decorative.
    const opened = openBfmDb(join(dir, 'bfm.db'));
    try {
      expect(() =>
        opened.raw
          .prepare(
            `INSERT INTO refresh_tokens (token_hash, device_id, family_id, expires_at)
             VALUES ('h', 'no-such-device', 'fam', '2099-01-01T00:00:00.000Z')`
          )
          .run()
      ).toThrow(/FOREIGN KEY/i);
    } finally {
      opened.raw.close();
    }
  });

  it('is idempotent — reopening an existing database changes nothing', () => {
    const path = join(dir, 'bfm.db');
    const first = openBfmDb(path);
    first.raw
      .prepare(
        `INSERT INTO devices (id, name, model, public_key_der) VALUES ('d1', 'phone', 'iPhone17,1', 'AAAA')`
      )
      .run();
    first.raw.close();

    const second = openBfmDb(path);
    try {
      expect(tableNames(second.raw)).toEqual(['devices', 'pairing_codes', 'refresh_tokens']);
      expect(
        second.raw.prepare(`SELECT count(*) AS n FROM devices`).get() as { n: number }
      ).toEqual({ n: 1 });
      const applied = second.raw
        .prepare(`SELECT count(*) AS n FROM __drizzle_migrations`)
        .get() as { n: number };
      // Read off the journal rather than written out: the claim is "each entry
      // applied exactly once", and a literal turns the next migration into a
      // failure in a test that is not about migrations.
      expect(applied.n, 'the migration journal was replayed instead of short-circuiting').toBe(
        readMigrationJournal(MIGRATIONS_DIR).length
      );
    } finally {
      second.raw.close();
    }
  });

  it('rejects a file that is not a database rather than half-opening it', () => {
    const path = join(dir, 'bfm.db');
    writeFileSync(path, 'this is not a sqlite file');
    expect(() => openBfmDb(path)).toThrow();
  });

  it('closes the handle when a pragma throws, not just when migration does', () => {
    // A file that is not a database does not fail at `new Database(path)` —
    // better-sqlite3 opens the descriptor lazily and only touches the file
    // header on the first real operation, which here is the first pragma
    // (`journal_mode = WAL`). That throw used to happen BEFORE openBfmDb's
    // try/catch started, so the already-constructed handle was silently
    // dropped instead of closed: no compile error, no failing assertion, a
    // handle now reachable only by whatever GC pass eventually collects it.
    //
    // `better-sqlite3` finalises a collected handle by calling back into the
    // Node-API environment it was created in. Vitest's fork-pool worker tears
    // that environment down once its files are done — if the GC pass that
    // collects this leaked handle lands after that teardown starts, the
    // finalizer aborts the whole worker process with
    // `Assertion failed: (env) != nullptr`, not a catchable JS error. That is
    // exactly the shape logged for POPS-1946 (an "Unhandled Errors" /
    // "Worker exited unexpectedly" failure with this file's tests as
    // neighbours in the run), and it is why this is asserted directly rather
    // than left to the "rejects a file that is not a database" case above to
    // imply — a leak here produces no failing assertion of its own, ever,
    // except by accident of GC timing on some later, unrelated run.
    //
    // Proven via `Database.prototype.pragma`, spied rather than mocked (every
    // call still runs the real implementation) so the instance `openBfmDb`
    // actually constructs can be inspected afterwards through its `open`
    // property, which better-sqlite3 flips to `false` exactly once `close()`
    // has run.
    const path = join(dir, 'bfm.db');
    writeFileSync(path, 'this is not a sqlite file');

    const instances: Database.Database[] = [];
    const original = Database.prototype.pragma;
    const spy = vi.spyOn(Database.prototype, 'pragma').mockImplementation(function (
      this: Database.Database,
      ...args: [string]
    ) {
      instances.push(this);
      return original.apply(this, args);
    });

    try {
      expect(() => openBfmDb(path)).toThrow();
    } finally {
      spy.mockRestore();
    }

    const captured = instances[0];
    if (captured === undefined)
      throw new Error('pragma() was never called — test is not exercising the path it claims to');
    expect(captured.open, 'the handle openBfmDb constructed was never closed').toBe(false);
  });

  it('closes the handle when the migration fails, leaving no live connection', () => {
    // Induced by pre-creating a table the migration will try to create.
    // Asserted through the WAL side files: SQLite removes `-wal`/`-shm` when
    // the last connection closes, so their presence after the throw is the
    // observable signature of a leaked descriptor.
    const path = join(dir, 'bfm.db');
    const squatter = new Database(path);
    squatter.exec(`CREATE TABLE devices (nonsense text)`);
    squatter.close();

    expect(() => openBfmDb(path)).toThrow();
    expect(existsSync(`${path}-wal`), 'WAL file left behind — the handle was not closed').toBe(
      false
    );
    expect(existsSync(`${path}-shm`), 'shm file left behind — the handle was not closed').toBe(
      false
    );
  });
});
