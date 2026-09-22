import { eq } from 'drizzle-orm';

import { itemFieldValues, items } from '../db/schema.js';
import { appendEvent } from '../domain/commands/events.js';
import { jsonValueSchema } from '../domain/commands/outcome.js';
import { upsertSearchIndex } from '../domain/commands/search-index.js';

import type { CommandDb, FieldValues } from '../domain/commands/entities.js';
import type { PersistedItemType } from './catalogue-types.js';
import type { CanonicalItemFieldValueInput, ItemFieldValueInput } from './item-values.js';
import type { MutableFieldValues } from './migration-steps.js';
import type { CatalogueMigration } from './migration-types.js';

/** A validated per-item migration result that is safe to persist atomically. */
export interface DryRunItem {
  readonly row: typeof items.$inferSelect;
  readonly type: PersistedItemType;
  readonly before: readonly MutableFieldValues[];
  readonly after: readonly MutableFieldValues[];
  readonly validated: readonly CanonicalItemFieldValueInput[];
  readonly supportsContainment: boolean;
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

/** Persists one validated migration result and its ordinary item event. */
export function writeMigratedItem(
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
