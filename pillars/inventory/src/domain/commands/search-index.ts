/**
 * `items_fts` maintenance (Inventory ADR-002 D9). The command layer keeps the
 * index current itself, rather than with triggers, because the type label
 * and field values live in the persisted catalogue/value store rather than
 * columns a trigger can read (migration `0013_items_fts`).
 */
import { eq, sql } from 'drizzle-orm';

import { resolvePublishedType } from '../../catalogue/catalogue.js';
import { parseCanonicalValue } from '../../catalogue/value-dispatch.js';
import { itemFieldValues, items } from '../../db/schema.js';

import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from '../../catalogue/catalogue-types.js';
import type { PrimitiveWireValue } from '../../catalogue/value-codec.js';
import type { ItemRow } from '../../db/row-types.js';
import type { CommandDb } from './entities.js';

/** The columns of an item row `items_fts` is built from. */
export type SearchableItem = Pick<
  ItemRow,
  'id' | 'name' | 'code' | 'note' | 'typeId' | 'externalIds'
>;

function searchableValue(field: PersistedItemTypeField, value: PrimitiveWireValue): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if ('optionId' in value) {
    const option = field.enumOptions.find((candidate) => candidate.id === value.optionId);
    return option?.label ?? '';
  }
  if ('amount' in value) return `${value.amount} ${value.unit}`;
  return '';
}

/** The active type's searchable field values, space-joined, for the free-text column. */
function fieldText(db: CommandDb, row: SearchableItem, type: PersistedItemType | null): string {
  if (!type) return '';
  const rows = db
    .select()
    .from(itemFieldValues)
    .where(eq(itemFieldValues.itemId, row.id))
    .orderBy(itemFieldValues.fieldId, itemFieldValues.source, itemFieldValues.ordinal)
    .all();
  const rowsByField = new Map<string, typeof rows>();
  for (const stored of rows) {
    const fieldRows = rowsByField.get(stored.fieldId) ?? [];
    fieldRows.push(stored);
    rowsByField.set(stored.fieldId, fieldRows);
  }
  const parts: string[] = [];
  for (const field of type.fields) {
    const readableField = { ...field, archivedEnumOptionIds: new Set<string>() };
    for (const stored of rowsByField.get(field.id) ?? []) {
      const text = searchableValue(
        field,
        parseCanonicalValue(readableField, stored.valueJson).value
      );
      if (text.length > 0) parts.push(text);
    }
  }
  return parts.join(' ');
}

/** The external ids' values, space-joined, for the free-text column. */
function externalIdsText(row: SearchableItem): string {
  const parsed = JSON.parse(row.externalIds) as readonly { value: string }[];
  return parsed.map((entry) => entry.value).join(' ');
}

/**
 * Write or replace `row`'s entry in `items_fts`, reflecting its current
 * name, code, note, type label and textual field and external-id values.
 * Publication migrations supply their candidate type before it becomes active.
 * Called by every op that changes one of those (`item.create`, `item.edit`,
 * `item.changeType`, `item.setCode`, `item.split`).
 */
export function upsertSearchIndex(
  db: CommandDb,
  row: SearchableItem,
  typeOverride?: PersistedItemType | null
): void {
  let type: PersistedItemType | null;
  if (typeOverride !== undefined) {
    type = typeOverride;
  } else if (row.typeId === null) {
    type = null;
  } else {
    type = resolvePublishedType(db, { id: row.typeId });
  }
  db.run(sql`delete from items_fts where id = ${row.id}`);
  db.run(sql`
    insert into items_fts (id, name, code, note, type_label, field_text, external_ids)
    values (
      ${row.id}, ${row.name}, ${row.code ?? ''}, ${row.note ?? ''},
      ${type?.label ?? ''}, ${fieldText(db, row, type)}, ${externalIdsText(row)}
    )
  `);
}

/** Drop `id`'s entry from `items_fts`. No op in this slice removes an item, so nothing calls this yet. */
export function removeFromSearchIndex(db: CommandDb, id: string): void {
  db.run(sql`delete from items_fts where id = ${id}`);
}

/**
 * Rebuild `items_fts` from scratch against `rows` using the current persisted
 * catalogue and values.
 */
export function rebuildSearchIndex(db: CommandDb, rows: readonly SearchableItem[]): void {
  db.run(sql`delete from items_fts`);
  for (const row of rows) upsertSearchIndex(db, row);
}

/** Rebuilds the search projection against a candidate catalogue snapshot. */
export function rebuildSearchIndexForCatalogue(db: CommandDb, catalogue: PersistedCatalogue): void {
  const rows = db
    .select({
      id: items.id,
      name: items.name,
      code: items.code,
      note: items.note,
      typeId: items.typeId,
      externalIds: items.externalIds,
    })
    .from(items)
    .all();
  db.run(sql`delete from items_fts`);
  for (const row of rows) {
    const type =
      row.typeId === null ? null : catalogue.types.find((entry) => entry.id === row.typeId);
    upsertSearchIndex(db, row, type);
  }
}
