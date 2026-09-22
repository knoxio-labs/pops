import { and, eq, isNull } from 'drizzle-orm';

import { itemFieldValues, items } from '../db/schema.js';
import { appendEvent } from '../domain/commands/events.js';
import { jsonValueSchema } from '../domain/commands/outcome.js';
import { upsertSearchIndex } from '../domain/commands/search-index.js';
import { validateItemFieldValuesForType } from './item-values.js';
import { applyMigrationStep, loadMigrationItemValues } from './migration-steps.js';

import type { CommandDb, FieldValues } from '../domain/commands/entities.js';
import type { PersistedCatalogue, PersistedItemType } from './catalogue-types.js';
import type { CanonicalItemFieldValueInput, ItemFieldValueInput } from './item-values.js';
import type { MutableFieldValues } from './migration-steps.js';
import type { CatalogueMigration, CatalogueMigrationResult } from './migration-types.js';

export type {
  CatalogueMigration,
  CatalogueMigrationResult,
  CatalogueMigrationStep,
} from './migration-types.js';

interface DryRunItem {
  readonly row: typeof items.$inferSelect;
  readonly type: PersistedItemType;
  readonly before: readonly MutableFieldValues[];
  readonly after: readonly MutableFieldValues[];
  readonly validated: readonly CanonicalItemFieldValueInput[];
  readonly supportsContainment: boolean;
}

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

function fieldProjection(fields: readonly ItemFieldValueInput[]): FieldValues {
  const result: FieldValues = {};
  for (const field of fields) result[field.fieldId] = jsonValueSchema.parse(field.values);
  return result;
}

function eventProjection(item: DryRunItem): { before: FieldValues; after: FieldValues } {
  const before = {
    ...fieldProjection(item.before),
    isContainer: item.row.isContainer === 1,
    access: item.row.access,
    isFull: item.row.isFull === null ? null : item.row.isFull === 1,
  };
  const after = {
    ...fieldProjection(item.after),
    isContainer: item.supportsContainment,
    access: item.supportsContainment ? (item.row.access ?? 'open') : null,
    isFull: item.supportsContainment && item.row.isFull !== null ? item.row.isFull === 1 : null,
  };
  return { before, after };
}

function replaceValues(
  db: CommandDb,
  input: {
    readonly itemId: string;
    readonly revision: number;
    readonly now: string;
    readonly fields: readonly CanonicalItemFieldValueInput[];
  }
): void {
  db.delete(itemFieldValues).where(eq(itemFieldValues.itemId, input.itemId)).run();
  for (const field of input.fields) {
    for (const [ordinal, value] of field.values.entries()) {
      db.insert(itemFieldValues)
        .values({
          itemId: input.itemId,
          fieldId: field.fieldId,
          source: field.source,
          ordinal,
          valueJson: value.valueJson,
          catalogueRevision: input.revision,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run();
    }
  }
}

function writeMigratedItem(
  db: CommandDb,
  migration: CatalogueMigration,
  item: DryRunItem,
  now: string
): boolean {
  const projection = eventProjection(item);
  if (JSON.stringify(projection.before) === JSON.stringify(projection.after)) return false;
  replaceValues(db, {
    itemId: item.row.id,
    revision: migration.toRevision,
    now,
    fields: item.validated,
  });
  const revision = item.row.revision + 1;
  const seq = appendEvent(db, {
    entityKind: 'item',
    entityId: item.row.id,
    kind: 'migrated',
    ...projection,
    reason: migration.name,
    entityRevision: revision,
    actor: { kind: 'migration', id: migration.name, label: 'Migration' },
    mutationId: null,
    compensatesSeq: null,
    clientTime: null,
    serverTime: now,
  });
  db.update(items)
    .set({
      revision,
      seq,
      updatedAt: now,
      lastEditedTime: now,
      isContainer: item.supportsContainment ? 1 : 0,
      access: item.supportsContainment ? (item.row.access ?? 'open') : null,
      isFull: item.supportsContainment ? item.row.isFull : null,
    })
    .where(eq(items.id, item.row.id))
    .run();
  upsertSearchIndex(db, item.row, item.type);
  return true;
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
  validateMigrationHeader(migration, candidate);
  const dryRun = dryRunMigration(db, migration, candidate);
  return db.transaction((tx) => ({
    name: migration.name,
    affectedItems: dryRun.filter((item) => writeMigratedItem(tx, migration, item, now)).length,
  }));
}
