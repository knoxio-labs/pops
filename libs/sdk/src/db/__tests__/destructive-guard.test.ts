import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { countRows } from '../connection.js';
import {
  assertDestructiveCommandAllowed,
  DestructiveCommandRefusedError,
  isForced,
} from '../destructive-guard.js';
import { openTestDatabase, type TestConnection } from './sqlite-harness.js';

let connection: TestConnection;
const logged: string[] = [];

function log(message: string): void {
  logged.push(message);
}

function guard(overrides: {
  env?: NodeJS.ProcessEnv;
  argv?: readonly string[];
  guardedTables?: readonly string[];
}): void {
  assertDestructiveCommandAllowed({
    command: 'mise run db:seed:food',
    connection,
    databasePath: '/data/sqlite/food.db',
    guardedTables: overrides.guardedTables ?? ['recipes'],
    env: overrides.env ?? {},
    argv: overrides.argv ?? [],
    log,
  });
}

function seedRecipes(count: number): void {
  connection.exec('CREATE TABLE recipes (id TEXT PRIMARY KEY)');
  for (let i = 0; i < count; i += 1) {
    connection.prepare('INSERT INTO recipes (id) VALUES (?)').run(`r-${i}`);
  }
}

beforeEach(() => {
  logged.length = 0;
  connection = openTestDatabase(':memory:');
});

afterEach(() => {
  connection.close();
});

describe('the production refusal', () => {
  it('refuses even against an empty database', () => {
    seedRecipes(0);
    expect(() => guard({ env: { NODE_ENV: 'production' } })).toThrow(
      DestructiveCommandRefusedError
    );
  });

  it('cannot be lifted by FORCE=true', () => {
    // The one refusal with no escape hatch: an env var that could turn it off
    // would be found and set by exactly the automation it exists to stop.
    seedRecipes(0);
    expect(() => guard({ env: { NODE_ENV: 'production', FORCE: 'true' } })).toThrow(
      /FORCE=true does NOT lift this/
    );
  });

  it('cannot be lifted by --force either', () => {
    seedRecipes(3);
    expect(() => guard({ env: { NODE_ENV: 'production' }, argv: ['--force'] })).toThrow(
      DestructiveCommandRefusedError
    );
  });

  it('names the environment as the reason, not the data', () => {
    seedRecipes(3);
    try {
      guard({ env: { NODE_ENV: 'production' } });
      expect.unreachable('the guard must have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DestructiveCommandRefusedError);
      expect((err as DestructiveCommandRefusedError).reason).toBe('production-environment');
    }
  });
});

describe('the data-presence refusal', () => {
  it('refuses a database whose key table holds rows, outside production', () => {
    seedRecipes(2);
    try {
      guard({ env: { NODE_ENV: 'development' } });
      expect.unreachable('the guard must have thrown');
    } catch (err) {
      expect((err as DestructiveCommandRefusedError).reason).toBe('populated-database');
      expect((err as Error).message).toContain('recipes=2');
      expect((err as Error).message).toContain('FORCE=true');
    }
  });

  it('passes on an empty development database, silently', () => {
    seedRecipes(0);
    expect(() => guard({ env: { NODE_ENV: 'development' } })).not.toThrow();
    expect(logged).toEqual([]);
  });

  it('passes when the guarded table does not exist yet', () => {
    // A half-migrated database is not a populated one; failing here would make
    // the guard unusable on a fresh checkout.
    expect(() => guard({ guardedTables: ['recipes', 'ingredients'] })).not.toThrow();
  });

  it('refuses when any one of several guarded tables holds rows', () => {
    seedRecipes(0);
    connection.exec('CREATE TABLE batches (id TEXT PRIMARY KEY)');
    connection.prepare('INSERT INTO batches (id) VALUES (?)').run('b-1');
    expect(() => guard({ guardedTables: ['recipes', 'batches'] })).toThrow(/batches=1/);
  });
});

describe('the escape hatch', () => {
  it('proceeds on FORCE=true, after saying what it is about to destroy', () => {
    seedRecipes(2);
    expect(() => guard({ env: { FORCE: 'true' } })).not.toThrow();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('/data/sqlite/food.db');
    expect(logged[0]).toContain('recipes=2');
  });

  it('proceeds on --force as well', () => {
    seedRecipes(2);
    expect(() => guard({ argv: ['node', 'seed.ts', '--force'] })).not.toThrow();
    expect(logged).toHaveLength(1);
  });

  it.each(['false', 'TRUE ', '1', 'yes'])('reads FORCE=%j the way it is written', (value) => {
    seedRecipes(1);
    const forced = isForced({ FORCE: value }, []);
    expect(forced).toBe(value.trim().toLowerCase() === 'true');
  });
});

describe('countRows', () => {
  it('refuses a table name it cannot safely quote', () => {
    expect(() => countRows(connection, 'recipes; DROP TABLE recipes')).toThrow(
      /not a plain SQLite identifier/
    );
  });

  it('is undefined for a table that does not exist', () => {
    expect(countRows(connection, 'nope')).toBeUndefined();
  });
});
