import { and, eq, isNull } from 'drizzle-orm';

import { items } from '../db/schema.js';
import { CatalogueApiError } from './authoring-types.js';
import { validateItemFieldValuesForType } from './item-values.js';
import { validateMigrationHeader } from './migration-coverage.js';
import { applyMigrationStep, loadMigrationItemValues } from './migration-steps.js';
import { migrationStepTargetFieldId, validateMigrationSteps } from './migration-validation.js';
import { writeMigratedItem } from './migration-write.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedCatalogue } from './catalogue-types.js';
import type { RequiredMigrationCoverage } from './migration-coverage.js';
import type { CatalogueMigration, CatalogueMigrationResult } from './migration-types.js';
import type { DryRunItem } from './migration-write.js';

export type {
  CatalogueMigration,
  CatalogueMigrationResult,
  CatalogueMigrationStep,
} from './migration-types.js';

function assertContainmentCanChange(
  db: CommandDb,
  row: typeof items.$inferSelect,
  supportsContainment: boolean
): void {
  if (row.isContainer !== 1 || supportsContainment) return;
  const content = db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.containingItemId, row.id),
        isNull(items.deletedAt),
        eq(items.lifecycle, 'active')
      )
    )
    .limit(1)
    .get();
  if (content) {
    throw new CatalogueApiError(
      409,
      'migration_containment_in_use',
      `Migration cannot remove containment from non-empty item ${row.id}`
    );
  }
}

/**
 * Refuses a migration that would grant containment to a type while any of
 * its live items carry `quantity > 1` (ADR-002 D3): a container must have
 * quantity exactly 1, and no migration step can safely decide how to split
 * an arbitrary group, so this is `forbidden` rather than an automatic fix.
 * Reports the affected count per type in one message rather than failing
 * one row at a time.
 */
function assertContainmentQuantityCompatible(
  candidate: PersistedCatalogue,
  rows: readonly (typeof items.$inferSelect)[]
): void {
  const offendersByType = new Map<string, number>();
  for (const row of rows) {
    if (row.typeId === null || row.quantity <= 1) continue;
    const type = candidate.types.find((entry) => entry.id === row.typeId);
    if (!type?.capabilities.includes('containment')) continue;
    offendersByType.set(type.id, (offendersByType.get(type.id) ?? 0) + 1);
  }
  for (const [typeId, count] of offendersByType) {
    throw new CatalogueApiError(
      409,
      'migration_containment_quantity_conflict',
      `Migration cannot grant containment to type ${typeId}: ${count} item(s) have quantity greater than 1`
    );
  }
}

function dryRunMigration(
  db: CommandDb,
  migration: CatalogueMigration,
  candidate: PersistedCatalogue,
  coverage: RequiredMigrationCoverage
): readonly DryRunItem[] {
  const typeIds = new Set(coverage.affectedTypeIds);
  const rows = db
    .select()
    .from(items)
    .where(isNull(items.deletedAt))
    .all()
    .filter((row) => row.typeId !== null && typeIds.has(row.typeId));
  assertContainmentQuantityCompatible(candidate, rows);
  validateMigrationSteps(migration, coverage, rows);
  return rows.map((row) => {
    const type = candidate.types.find((entry) => entry.id === row.typeId);
    if (!type) throw new Error(`migration ${migration.name} has no candidate type ${row.typeId}`);
    const supportsContainment = type.capabilities.includes('containment');
    assertContainmentCanChange(db, row, supportsContainment);
    const before = loadMigrationItemValues(db, row.id);
    const after = before.map((entry) => ({ ...entry, values: [...entry.values] }));
    for (const step of migration.steps) {
      if (coverage.fieldTypeIds.get(migrationStepTargetFieldId(step)) === row.typeId) {
        applyMigrationStep(after, step, candidate);
      }
    }
    const validated = validateItemFieldValuesForType(db, type, after, row.id);
    return { row, type, before, after, validated, supportsContainment };
  });
}

/**
 * Dry-runs every affected row, then persists the complete migration and one
 * ordinary `migrated` item event per changed item in the caller's transaction.
 */
export function executeCatalogueMigration(
  db: CommandDb,
  migration: CatalogueMigration,
  candidate: PersistedCatalogue,
  now: string
): CatalogueMigrationResult {
  return db.transaction((tx) =>
    executeCatalogueMigrationInTransaction(tx, migration, candidate, now)
  );
}

/** Executes a migration inside a caller-owned publication transaction. */
export function executeCatalogueMigrationInTransaction(
  db: CommandDb,
  migration: CatalogueMigration,
  candidate: PersistedCatalogue,
  now: string
): CatalogueMigrationResult {
  const coverage = validateMigrationHeader(db, migration, candidate);
  const dryRun = dryRunMigration(db, migration, candidate, coverage);
  return {
    name: migration.name,
    affectedItems: dryRun.filter((item) => writeMigratedItem(db, migration, item, now)).length,
  };
}
