/**
 * The refusals on the fleet's one destructive script.
 *
 * Half of these call the guard directly, which is where the food-specific
 * choice lives (which tables count as "this database holds real food data").
 * The other half runs the script as `mise run db:seed:food` runs it, because
 * a guard that is defined but never reached is decorative — and the seed wipes
 * twenty-one tables the moment it gets past this point.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DestructiveCommandRefusedError } from '@pops/pillar-sdk/db';

import { assertFoodSeedAllowed, FOOD_SEED_GUARDED_TABLES } from '../db-seed-food.js';

const PILLAR_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(PILLAR_DIR, 'scripts', 'db-seed-food.ts');
// Inside the package, because `assertSeedTargetIsDev` refuses a target that
// resolves outside it — a temp dir under the OS tmpdir never reaches the
// refusals these tests are about. `pillars/food/data/` is gitignored.
const SCRATCH_ROOT = join(PILLAR_DIR, 'data');

let dir: string;
let dbPath: string;
let db: Database.Database;
const logged: string[] = [];

function log(message: string): void {
  logged.push(message);
}

/** A database carrying food's guarded tables, empty unless `recipes` is asked for. */
function createFoodTables(recipeCount: number): void {
  for (const table of FOOD_SEED_GUARDED_TABLES) {
    db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
  }
  for (let i = 0; i < recipeCount; i += 1) {
    db.prepare('INSERT INTO recipes (id) VALUES (?)').run(`recipe-${i}`);
  }
}

function guard(env: NodeJS.ProcessEnv, argv: readonly string[] = []): void {
  assertFoodSeedAllowed({ connection: db, databasePath: dbPath, env, argv, log });
}

/** Run the script the way the mise task does, returning stderr on refusal. */
function runScript(env: NodeJS.ProcessEnv): { status: number; output: string } {
  try {
    const stdout = execFileSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: PILLAR_DIR,
      env: { ...process.env, FOOD_SQLITE_PATH: undefined, SQLITE_PATH: dbPath, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output: stdout };
  } catch (err) {
    const failure = err as { status?: number; stderr?: string; stdout?: string };
    return {
      status: failure.status ?? -1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

beforeEach(() => {
  logged.length = 0;
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  dir = mkdtempSync(join(SCRATCH_ROOT, 'food-seed-guard-'));
  dbPath = join(dir, 'food.db');
  db = new Database(dbPath);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('assertFoodSeedAllowed', () => {
  it('refuses under NODE_ENV=production, even with nothing to lose', () => {
    createFoodTables(0);
    expect(() => guard({ NODE_ENV: 'production' })).toThrow(DestructiveCommandRefusedError);
  });

  it('refuses under NODE_ENV=production even when FORCE=true is set', () => {
    createFoodTables(0);
    expect(() => guard({ NODE_ENV: 'production', FORCE: 'true' })).toThrow(
      /FORCE=true does NOT lift this/
    );
  });

  it('refuses a database that already holds recipes', () => {
    createFoodTables(3);
    expect(() => guard({ NODE_ENV: 'development' })).toThrow(/recipes=3/);
  });

  it('refuses on a used kitchen even with no recipes left', () => {
    createFoodTables(0);
    db.prepare('INSERT INTO batches (id) VALUES (?)').run('batch-1');
    expect(() => guard({})).toThrow(/batches=1/);
  });

  it('passes on an empty development database without saying anything', () => {
    createFoodTables(0);
    expect(() => guard({ NODE_ENV: 'development' })).not.toThrow();
    expect(logged).toEqual([]);
  });

  it('proceeds on FORCE=true, naming what it is about to destroy', () => {
    createFoodTables(2);
    expect(() => guard({ FORCE: 'true' })).not.toThrow();
    expect(logged[0]).toContain('recipes=2');
  });
});

describe('the script itself', () => {
  it('exits non-zero and wipes nothing when the database holds recipes', () => {
    createFoodTables(2);
    const run = runScript({ NODE_ENV: 'development' });

    expect(run.status).toBe(1);
    expect(run.output).toContain('recipes=2');
    expect(run.output).toContain('FORCE=true');
    const remaining = db.prepare('SELECT count(*) AS n FROM recipes').get() as { n: number };
    expect(remaining.n).toBe(2);
  });

  it('targets the sibling food.db, not the file a shared SQLITE_PATH names', () => {
    createFoodTables(2);
    const shared = join(dir, 'pops.db');
    new Database(shared).close();

    const run = runScript({ NODE_ENV: 'development', SQLITE_PATH: shared });

    expect(run.status).toBe(1);
    expect(run.output).toContain(dbPath);
    expect(run.output).not.toContain(shared);
  });

  it('exits non-zero under NODE_ENV=production, wiping nothing', () => {
    createFoodTables(2);
    const run = runScript({ NODE_ENV: 'production' });

    expect(run.status).toBe(1);
    // The dev-target guard reaches production first, so this asserts the
    // script refuses at all rather than pinning which of the two refused.
    expect(run.output).toMatch(/production/u);
    const remaining = db.prepare('SELECT count(*) AS n FROM recipes').get() as { n: number };
    expect(remaining.n).toBe(2);
  });
}, 60_000);
