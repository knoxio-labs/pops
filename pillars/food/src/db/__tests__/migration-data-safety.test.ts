/**
 * What the tail of the migration chain does to food data that was already
 * there.
 *
 * Every other test in this pillar opens a database that was empty when the
 * migrations ran, so a migration that drops a table or corrupts a foreign key
 * passes all of them and is only discovered against the live file. This one
 * pins the shape: bring a database up to `0062_food_ai_inference_log` from a
 * truncated journal, write representative rows through raw SQL, then reopen
 * it with the real opener, which applies `0063_drop_ai_inference_log` — the
 * one migration left in the journal, and the one that removes a whole table.
 * `ai_inference_log` must go; everything else — ingredients, their variants,
 * and a recipe with a JSON-bearing step — must come through untouched.
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

import { openFoodDb } from '../open-food-db.js';

import type { OpenedFoodDb } from '../open-food-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The last entry that exists before `0063_drop_ai_inference_log` runs. */
const BASELINE_TAG = '0062_food_ai_inference_log';

/** The JSON payload a compiled recipe step actually carries. */
const BODY_RESOLVED_JSON = {
  ingredients: [{ ingredientId: 1, variantId: 1, qtyG: 500 }],
  note: "knead well, don't rush the gluten",
};

let dir: string;
let dbPath: string;
let opened: OpenedFoodDb;

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
      `INSERT INTO ingredients (id, name, slug, default_unit, density_g_per_ml)
       VALUES (1, 'Flour', 'flour', 'g', NULL)`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO ingredient_variants
         (id, ingredient_id, name, slug, default_unit, package_size_g)
       VALUES (1, 1, 'All-purpose flour', 'all-purpose-flour', 'g', 1000)`
    )
    .run();

  raw
    .prepare(`INSERT INTO recipes (id, slug, recipe_type) VALUES (1, 'basic-bread', 'plate')`)
    .run();
  raw
    .prepare(
      `INSERT INTO recipe_versions (id, recipe_id, version_no, status, title, body_dsl, servings)
       VALUES (1, 1, 1, 'current', 'Basic Bread', 'mix(flour, water) -> knead -> bake', 4)`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO recipe_steps (id, recipe_version_id, position, body_md, body_resolved_json)
       VALUES (1, 1, 1, 'Mix the flour and water.', ?)`
    )
    .run(JSON.stringify(BODY_RESOLVED_JSON));

  raw
    .prepare(
      `INSERT INTO ai_inference_log
         (id, provider, model, operation, domain, input_tokens, output_tokens, cost_usd, created_at)
       VALUES (1, 'anthropic', 'claude-sonnet', 'recipe-extraction', 'food', 512, 128, 0.014, '2026-01-01T00:00:00Z')`
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

function tableExists(name: string): boolean {
  return (
    opened.raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name) !== undefined
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'food-migration-safety-'));
  dbPath = join(dir, 'food.db');
  seedThroughBaseline();
  opened = openFoodDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying the rest of the journal to a populated food database', () => {
  it('applies every remaining entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('removes the pre-migration snapshot it took on the way through', () => {
    // The reopen above had one entry pending against a file that already held
    // rows, so the snapshot path really ran here.
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('drops the ai_inference_log table entirely', () => {
    expect(tableExists('ai_inference_log')).toBe(false);
  });

  it('loses no rows from any surviving table', () => {
    expect(count('ingredients')).toBe(1);
    expect(count('ingredient_variants')).toBe(1);
    expect(count('recipes')).toBe(1);
    expect(count('recipe_versions')).toBe(1);
    expect(count('recipe_steps')).toBe(1);
  });

  it('keeps the ingredient and its variant intact, including their foreign key', () => {
    const ingredient = opened.raw
      .prepare(`SELECT name, slug, default_unit FROM ingredients WHERE id = 1`)
      .get();
    expect(ingredient).toEqual({ name: 'Flour', slug: 'flour', default_unit: 'g' });

    const variant = opened.raw
      .prepare(
        `SELECT ingredient_id, name, slug, package_size_g FROM ingredient_variants WHERE id = 1`
      )
      .get();
    expect(variant).toEqual({
      ingredient_id: 1,
      name: 'All-purpose flour',
      slug: 'all-purpose-flour',
      package_size_g: 1000,
    });
  });

  it('keeps the recipe chain attached from recipe through to its step', () => {
    const stored = opened.raw
      .prepare(
        `SELECT r.slug, rv.title, rv.body_dsl, rs.body_md
         FROM recipe_steps rs
         JOIN recipe_versions rv ON rv.id = rs.recipe_version_id
         JOIN recipes r ON r.id = rv.recipe_id
         WHERE rs.id = 1`
      )
      .get();
    expect(stored).toEqual({
      slug: 'basic-bread',
      title: 'Basic Bread',
      body_dsl: 'mix(flour, water) -> knead -> bake',
      body_md: 'Mix the flour and water.',
    });
  });

  it('leaves the JSON-bearing step column parseable and unchanged', () => {
    const stored = opened.raw
      .prepare(`SELECT body_resolved_json FROM recipe_steps WHERE id = 1`)
      .get() as { body_resolved_json: string };
    expect(() => JSON.parse(stored.body_resolved_json) as unknown).not.toThrow();
    expect(JSON.parse(stored.body_resolved_json)).toEqual(BODY_RESOLVED_JSON);
  });

  it('leaves no broken foreign key anywhere in the database', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });
});
