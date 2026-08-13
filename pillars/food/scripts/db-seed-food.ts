/**
 * Food-only seed runner.
 *
 * Wipes food's tables in the SQLite file at `SQLITE_PATH` and invokes
 * `seedFood`. Run via `mise run db:seed:food` from the repo root, which
 * sets `SQLITE_PATH` to the food pillar's dev DB.
 *
 * It is the fleet's one destructive script, so it is also the one place the
 * shared guard in `@pops/pillar-sdk/db` is wired up: production is refused
 * outright, and a database that already holds food records is refused unless
 * the operator states the intent with `FORCE=true` (or `--force`).
 */
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { assertDestructiveCommandAllowed, type SqliteConnection } from '@pops/pillar-sdk/db';

import { compileRecipeVersion } from '../src/dsl/compile.js';
import { seedFood } from '../src/seed/index.js';

// Wipe only food tables. Children first; `foreign_keys = OFF` makes the
// order purely defensive. The conversion tables (unit_conversions,
// ingredient_weights) must be wiped too so re-running the seed stays
// idempotent — they carry a UNIQUE on (from_unit,to_unit) / a partial
// UNIQUE on (ingredient_id, variant_id, unit) that would otherwise collide
// on the second run.
const FOOD_TABLES = [
  'batch_consumptions',
  'recipe_runs',
  'batches',
  'plan_entries',
  'plan_slots',
  'substitutions',
  'recipe_tags',
  'recipe_lines',
  'recipe_steps',
  'recipe_version_proposed_slugs',
  'recipe_versions',
  'recipes',
  'ingredient_weights',
  'unit_conversions',
  'ingredient_tags',
  'ingredient_aliases',
  'ingredient_variants',
  'prep_states',
  'ingredients',
  'ingest_sources',
  'slug_registry',
] as const;

/**
 * The tables whose contents mean this database is worth more than a fixture
 * set.
 *
 * `recipes` and `ingredients` are what a hand-entered kitchen looks like, and
 * `batches` is what a used one looks like — all three are wiped by the seed,
 * so any one of them holding rows is enough to stop and ask. The other
 * eighteen tables in {@link FOOD_TABLES} hang off these by foreign key, so
 * naming them too would only make the message longer.
 */
export const FOOD_SEED_GUARDED_TABLES = ['recipes', 'ingredients', 'batches'] as const;

/**
 * Refuse the seed against production, or against a database that already
 * holds food records.
 *
 * @throws {DestructiveCommandRefusedError} When the seed must not run.
 */
export function assertFoodSeedAllowed(options: {
  connection: SqliteConnection;
  databasePath: string;
  env?: NodeJS.ProcessEnv;
  argv?: readonly string[];
  log?: (message: string) => void;
}): void {
  assertDestructiveCommandAllowed({
    command: 'mise run db:seed:food',
    connection: options.connection,
    databasePath: options.databasePath,
    guardedTables: FOOD_SEED_GUARDED_TABLES,
    env: options.env,
    argv: options.argv,
    log: options.log,
  });
}

function main(): void {
  const dbPath = process.env.SQLITE_PATH ?? './data/pops.db';

  if (!existsSync(dbPath)) {
    console.error(`❌ Database not found at ${dbPath}`);
    console.warn('💡 Start the food pillar once — it creates and migrates its own database');
    process.exit(1);
  }

  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  try {
    assertFoodSeedAllowed({ connection: db, databasePath: dbPath });
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    db.close();
    process.exit(1);
  }

  console.warn(`🌱 Seeding food fixtures at ${dbPath}...\n`);

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const table of FOOD_TABLES) {
        db.exec(`DELETE FROM "${table}"`);
      }
      const drizzleDb = drizzle(db);
      // Pass compileRecipeVersion so the seed DB ends up with materialised
      // recipe_lines / recipe_steps and every recipe's v1 promoted to `current`.
      const summary = seedFood(drizzleDb, { compileRecipeVersion });
      console.warn('\n✅ Food seed complete\n');
      console.warn('📊 Counts:');
      const printRow = (label: string, value: number): void => {
        // Pad to one space past the widest label so values line up regardless
        // of which counters are present in the summary.
        console.warn(`  ${`${label}:`.padEnd(21)}${value}`);
      };
      printRow('prep_states', summary.prepStates);
      printRow('ingredients', summary.ingredients);
      printRow('variants', summary.variants);
      printRow('aliases', summary.aliases);
      printRow('substitutions', summary.substitutions);
      printRow('plan_slots', summary.planSlots);
      printRow('plan_entries', summary.planEntries);
      printRow('recipes', summary.recipes);
      printRow('recipe_versions', summary.recipeVersions);
      printRow('batches', summary.batches);
      printRow('recipe_runs', summary.recipeRuns);
      printRow('batch_consumptions', summary.batchConsumptions);
      printRow('ingest_sources', summary.ingestSources);
      printRow('unit_conversions', summary.unitConversions);
      printRow('ingredient_weights', summary.ingredientWeights);
      printRow('ingredient_tags', summary.ingredientTags);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  db.close();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
