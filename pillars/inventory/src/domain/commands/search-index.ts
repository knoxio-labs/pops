/**
 * `items_fts` maintenance (Inventory ADR-002 D9). The command layer keeps the
 * index current itself, rather than with triggers, because the type label
 * and field values live in the persisted catalogue/value store rather than
 * columns a trigger can read (migration `0013_items_fts`).
 */
import { sql } from 'drizzle-orm';

import { loadProtocol1Fields, resolveProtocol1TypeById } from '../../catalogue/index.js';

import type { ItemRow } from '../../db/row-types.js';
import type { CommandDb } from './entities.js';

/** The columns of an item row `items_fts` is built from. */
export type SearchableItem = Pick<
  ItemRow,
  'id' | 'name' | 'code' | 'note' | 'typeId' | 'externalIds'
>;

/** The type's textual field values, space-joined, for the free-text column. */
function fieldText(db: CommandDb, row: SearchableItem): string {
  if (row.typeId === null) return '';
  const type = resolveProtocol1TypeById(db, row.typeId);
  if (!type) return '';
  const fields = loadProtocol1Fields(db, row.id);
  const parts: string[] = [];
  for (const field of type.fields) {
    const value = fields[field.key];
    if (typeof value === 'string' && value.length > 0) parts.push(value);
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
 * Called by every op that changes one of those (`item.create`, `item.edit`,
 * `item.changeType`, `item.setCode`, `item.split`).
 */
export function upsertSearchIndex(db: CommandDb, row: SearchableItem): void {
  const type = row.typeId === null ? null : resolveProtocol1TypeById(db, row.typeId);
  db.run(sql`delete from items_fts where id = ${row.id}`);
  db.run(sql`
    insert into items_fts (id, name, code, note, type_label, field_text, external_ids)
    values (
      ${row.id}, ${row.name}, ${row.code ?? ''}, ${row.note ?? ''},
      ${type?.label ?? ''}, ${fieldText(db, row)}, ${externalIdsText(row)}
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
