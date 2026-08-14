import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  defaultPillarDbPath,
  discoverPillarIdsWithDatabases,
  parseDbClearArgv,
  runDbClear,
} from '../db-clear.js';
import { DevDatabaseGuardError } from '../dev-db-guard.js';

let root: string;
const logged: string[] = [];
const log = (message: string): void => {
  logged.push(message);
};

function makePillar(id: string, options: { withDb?: boolean } = {}): string {
  mkdirSync(join(root, 'pillars', id, 'migrations'), { recursive: true });
  const dbPath = defaultPillarDbPath(root, id);
  if (options.withDb === true) {
    mkdirSync(join(root, 'pillars', id, 'data'), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT);
      INSERT INTO __drizzle_migrations (hash) VALUES ('head');
      CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO items (id, name) VALUES (1, 'a'), (2, 'b');
    `);
    db.close();
  }
  return dbPath;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pops-db-clear-'));
  logged.length = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('discoverPillarIdsWithDatabases', () => {
  it('finds only pillars that own a migration journal, sorted', () => {
    makePillar('media');
    makePillar('finance');
    mkdirSync(join(root, 'pillars', 'shell'), { recursive: true });
    expect(discoverPillarIdsWithDatabases(root)).toEqual(['finance', 'media']);
  });

  it('returns nothing when there is no pillars directory', () => {
    expect(discoverPillarIdsWithDatabases(join(root, 'nope'))).toEqual([]);
  });
});

describe('parseDbClearArgv', () => {
  it('parses a single pillar id', () => {
    expect(parseDbClearArgv(['finance'], root)).toEqual({ pillarIds: ['finance'] });
  });

  it('parses an explicit database path', () => {
    expect(parseDbClearArgv(['finance', '--db', '/tmp/x.db'], root)).toEqual({
      pillarIds: ['finance'],
      dbPath: '/tmp/x.db',
    });
  });

  it('expands --all to every pillar owning a database', () => {
    makePillar('food');
    makePillar('lists');
    expect(parseDbClearArgv(['--all'], root)).toEqual({ pillarIds: ['food', 'lists'] });
  });

  it.each([
    [[], /usage/u],
    [['a', 'b'], /usage/u],
    [['--all', 'food'], /--all takes no pillar id/u],
    [['--all', '--db', '/tmp/x.db'], /cannot be combined/u],
    [['finance', '--db'], /--db requires a path/u],
    [['--wipe-everything'], /unknown flag/u],
  ])('rejects %j', (argv: string[], expected: RegExp) => {
    expect(() => parseDbClearArgv(argv, root)).toThrow(expected);
  });
});

describe('runDbClear', () => {
  it('clears rows and keeps the migration journal', () => {
    makePillar('inventory', { withDb: true });
    const result = runDbClear({ pillarId: 'inventory', repoRoot: root, env: {}, log });

    expect(result.skipped).toBe(false);
    expect(result.cleared).toEqual([{ table: 'items', deleted: 2 }]);

    const db = new DatabaseSync(defaultPillarDbPath(root, 'inventory'));
    expect(db.prepare('SELECT COUNT(*) AS c FROM items').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM __drizzle_migrations').get()).toEqual({ c: 1 });
    db.close();
  });

  it('skips a pillar whose database has never been created', () => {
    makePillar('lists');
    const result = runDbClear({ pillarId: 'lists', repoRoot: root, env: {}, log });
    expect(result.skipped).toBe(true);
    expect(logged.join('\n')).toMatch(/nothing to clear/u);
  });

  it('refuses to run with NODE_ENV=production and leaves the rows intact', () => {
    makePillar('finance', { withDb: true });
    expect(() =>
      runDbClear({ pillarId: 'finance', repoRoot: root, env: { NODE_ENV: 'production' }, log })
    ).toThrow(DevDatabaseGuardError);

    const db = new DatabaseSync(defaultPillarDbPath(root, 'finance'));
    expect(db.prepare('SELECT COUNT(*) AS c FROM items').get()).toEqual({ c: 2 });
    db.close();
  });

  it('refuses an explicit database path outside the working tree', () => {
    makePillar('finance');
    expect(() =>
      runDbClear({
        pillarId: 'finance',
        repoRoot: root,
        dbPath: '/data/sqlite/finance.db',
        env: {},
        log,
      })
    ).toThrow(DevDatabaseGuardError);
  });

  it('rejects a pillar that owns no database', () => {
    makePillar('food');
    expect(() => runDbClear({ pillarId: 'shell', repoRoot: root, env: {}, log })).toThrow(
      /owns no database/u
    );
  });

  it.each(['../../etc', 'Finance', 'food/../lists', ''])(
    'rejects the malformed pillar id %p',
    (pillarId: string) => {
      expect(() => runDbClear({ pillarId, repoRoot: root, env: {}, log })).toThrow(
        /invalid pillar id/u
      );
    }
  );
});
