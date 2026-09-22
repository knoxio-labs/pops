import { and, eq, isNull } from 'drizzle-orm';

import { items } from '../db/schema.js';
import { validateItemFieldValuesForType } from './item-values.js';
import { applyMigrationStep, loadMigrationItemValues } from './migration-steps.js';
import { writeMigratedItem } from './migration-write.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedCatalogue } from './catalogue-types.js';
import type { CatalogueMigration, CatalogueMigrationResult } from './migration-types.js';
import type { DryRunItem } from './migration-write.js';

export type {
  CatalogueMigration,
  CatalogueMigrationResult,
  CatalogueMigrationStep,
} from './migration-types.js';

function validateMigrationHeader(
  migration: CatalogueMigration,
  candidate: PersistedCatalogue
): void {
  if (
    candidate.revision.revision !== migration.toRevision ||
    candidate.revision.baseRevision !== migration.fromRevision
  ) {
    throw new Error(`migration ${migration.name} does not match the candidate revision`);
  }
  const affectedFields = new Set(migration.affectedFieldIds);
  for (const step of migration.steps) {
    const named =
      step.kind === 'copy' || step.kind === 'convert_decimal'
        ? [step.fromFieldId, step.toFieldId]
        : [step.fieldId];
    if (named.some((fieldId) => !affectedFields.has(fieldId))) {
      throw new Error(`migration ${migration.name} uses an undeclared affected field`);
    }
  }
}

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
  if (content) throw new Error(`migration cannot remove containment from non-empty item ${row.id}`);
}

function dryRunMigration(
  db: CommandDb,
  migration: CatalogueMigration,
  candidate: PersistedCatalogue
): readonly DryRunItem[] {
  const typeIds = new Set(migration.affectedTypeIds);
  const rows = db
    .select()
    .from(items)
    .where(isNull(items.deletedAt))
    .all()
    .filter((row) => row.typeId !== null && typeIds.has(row.typeId));
  return rows.map((row) => {
    const type = candidate.types.find((entry) => entry.id === row.typeId);
    if (!type) throw new Error(`migration ${migration.name} has no candidate type ${row.typeId}`);
    const supportsContainment = type.capabilities.includes('containment');
    assertContainmentCanChange(db, row, supportsContainment);
    const before = loadMigrationItemValues(db, row.id);
    const after = before.map((entry) => ({ ...entry, values: [...entry.values] }));
    for (const step of migration.steps) applyMigrationStep(after, step, candidate);
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
  validateMigrationHeader(migration, candidate);
  const dryRun = dryRunMigration(db, migration, candidate);
  return {
    name: migration.name,
    affectedItems: dryRun.filter((item) => writeMigratedItem(db, migration, item, now)).length,
  };
}
