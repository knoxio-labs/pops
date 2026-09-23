/**
 * `items_fts` maintenance (Inventory ADR-002 D9). The command layer keeps the
 * index current itself, rather than with triggers, because the type label
 * and field values live in the persisted catalogue/value store rather than
 * columns a trigger can read (migration `0013_items_fts`).
 */
import { eq, inArray, sql } from 'drizzle-orm';

import { loadPublishedCatalogue } from '../../catalogue/catalogue.js';
import { readEffectiveItemFieldValuesForItems } from '../../catalogue/effective-item-values.js';
import { parseCanonicalValue } from '../../catalogue/value-dispatch.js';
import { itemFieldValues, items } from '../../db/schema.js';

import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from '../../catalogue/catalogue-types.js';
import type { EffectiveItemFieldValue } from '../../catalogue/item-value-types.js';
import type { PrimitiveWireValue } from '../../catalogue/value-codec.js';
import type { ItemRow } from '../../db/row-types.js';
import type { CommandDb } from './entities.js';

/** The columns of an item row `items_fts` is built from. */
export type SearchableItem = Pick<
  ItemRow,
  'id' | 'name' | 'code' | 'note' | 'typeId' | 'externalIds'
>;

type EffectiveValues = ReadonlyMap<string, readonly EffectiveItemFieldValue[]>;

const NO_EFFECTIVE_VALUES: EffectiveValues = new Map();

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

function persistedValues(
  field: PersistedItemTypeField,
  rows: readonly (typeof itemFieldValues.$inferSelect)[]
): PrimitiveWireValue[] {
  const readableField = { ...field, archivedEnumOptionIds: new Set<string>() };
  return rows
    .filter((stored) => stored.fieldId === field.id)
    .map((stored) => parseCanonicalValue(readableField, stored.valueJson).value);
}

/**
 * A computed field's evaluated values, and only those: an override is a
 * persisted row and is indexed as one, and an unavailable result has no text.
 */
function evaluatedValues(
  field: PersistedItemTypeField,
  effective: readonly EffectiveItemFieldValue[]
): readonly PrimitiveWireValue[] {
  const value = effective.find((entry) => entry.fieldId === field.id);
  if (value?.state !== 'value' || value.provenance.source !== 'computed') return [];
  return value.values;
}

/**
 * The type's searchable effective field values, space-joined, for the
 * free-text column: stored values, overrides, and the evaluated value of a
 * computed field without an override.
 */
function fieldText(
  db: CommandDb,
  row: SearchableItem,
  type: PersistedItemType | null,
  effective: readonly EffectiveItemFieldValue[]
): string {
  if (!type) return '';
  const rows = db
    .select()
    .from(itemFieldValues)
    .where(eq(itemFieldValues.itemId, row.id))
    .orderBy(itemFieldValues.fieldId, itemFieldValues.source, itemFieldValues.ordinal)
    .all();
  const parts: string[] = [];
  for (const field of type.fields) {
    const persisted = persistedValues(field, rows);
    const values =
      field.storage === 'computed' && persisted.length === 0
        ? evaluatedValues(field, effective)
        : persisted;
    for (const value of values) {
      const text = searchableValue(field, value);
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

function writeEntry(
  db: CommandDb,
  row: SearchableItem,
  type: PersistedItemType | null,
  effective: readonly EffectiveItemFieldValue[]
): void {
  db.run(sql`delete from items_fts where id = ${row.id}`);
  db.run(sql`
    insert into items_fts (id, name, code, note, type_label, field_text, external_ids)
    values (
      ${row.id}, ${row.name}, ${row.code ?? ''}, ${row.note ?? ''},
      ${type?.label ?? ''}, ${fieldText(db, row, type, effective)}, ${externalIdsText(row)}
    )
  `);
}

function typeOf(
  catalogue: PersistedCatalogue | null,
  row: SearchableItem
): PersistedItemType | null {
  if (catalogue === null || row.typeId === null) return null;
  return catalogue.types.find((entry) => entry.id === row.typeId) ?? null;
}

/**
 * Evaluates, through one snapshot, the rows whose type has a computed field.
 * `catalogue` must be published: evaluation reads persisted values through
 * the revisions that validated them.
 */
function effectiveValuesFor(
  db: CommandDb,
  catalogue: PersistedCatalogue | null,
  rows: readonly SearchableItem[]
): EffectiveValues {
  if (catalogue === null) return NO_EFFECTIVE_VALUES;
  const ids = rows
    .filter((row) => typeOf(catalogue, row)?.fields.some((field) => field.storage === 'computed'))
    .map((row) => row.id);
  return ids.length === 0
    ? NO_EFFECTIVE_VALUES
    : readEffectiveItemFieldValuesForItems(db, catalogue, ids);
}

function indexAgainst(
  db: CommandDb,
  rows: readonly SearchableItem[],
  catalogue: PersistedCatalogue | null
): void {
  const effective = effectiveValuesFor(db, catalogue, rows);
  for (const row of rows) {
    writeEntry(db, row, typeOf(catalogue, row), effective.get(row.id) ?? []);
  }
}

function searchableRows(db: CommandDb, ids?: readonly string[]): SearchableItem[] {
  const query = db
    .select({
      id: items.id,
      name: items.name,
      code: items.code,
      note: items.note,
      typeId: items.typeId,
      externalIds: items.externalIds,
    })
    .from(items);
  return ids === undefined ? query.all() : query.where(inArray(items.id, [...ids])).all();
}

/**
 * Write or replace `row`'s entry in `items_fts`, reflecting its current
 * name, code, note, type label and effective textual field and external-id
 * values against the published catalogue. A computed field contributes its
 * override when one exists, otherwise its evaluated value; an unavailable
 * result contributes nothing (Inventory ADR-002 D5).
 *
 * A publication migration supplies its candidate type before the candidate
 * is published. That entry carries stored values and overrides only: the
 * publication rebuilds the whole index, evaluations included, before it
 * commits. Called by every op that changes one of those (`item.create`,
 * `item.edit`, `item.changeType`, `item.setCode`, `item.split`,
 * `item.setOverride`, `item.clearOverride`).
 */
export function upsertSearchIndex(
  db: CommandDb,
  row: SearchableItem,
  candidateType?: PersistedItemType | null
): void {
  if (candidateType !== undefined) {
    writeEntry(db, row, candidateType, []);
    return;
  }
  indexAgainst(db, [row], loadPublishedCatalogue(db));
}

/**
 * Re-reads `ids` from `items` and rewrites their `items_fts` entries against
 * the published catalogue, in the caller's transaction: the entry point for
 * items whose effective computed values changed through another item's write.
 */
export function reindexItems(db: CommandDb, ids: readonly string[]): void {
  if (ids.length === 0) return;
  indexAgainst(db, searchableRows(db, ids), loadPublishedCatalogue(db));
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
  indexAgainst(db, rows, loadPublishedCatalogue(db));
}

/** Rebuilds the search projection against a just-published catalogue snapshot. */
export function rebuildSearchIndexForCatalogue(db: CommandDb, catalogue: PersistedCatalogue): void {
  db.run(sql`delete from items_fts`);
  indexAgainst(db, searchableRows(db), catalogue);
}
