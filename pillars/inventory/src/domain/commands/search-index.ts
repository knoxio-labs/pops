/**
 * `items_fts` maintenance (Inventory ADR-002 D9). The command layer keeps the
 * index current itself, rather than with triggers, because the type label
 * comes from code (`findType`), not from a column a trigger could read
 * (migration `0013_items_fts`).
 */
import { sql } from 'drizzle-orm';

import { findType } from '../../types/index.js';

import type { ItemRow } from '../../db/index.js';
import type { FieldDefinition } from '../../types/index.js';
import type { CommandDb } from './entities.js';

/** The columns of an item row `items_fts` is built from. */
export type SearchableItem = Pick<
  ItemRow,
  'id' | 'name' | 'code' | 'note' | 'typeKey' | 'fields' | 'externalIds'
>;

const TEXTUAL_KINDS: ReadonlySet<FieldDefinition['kind']> = new Set(['text', 'choice', 'link']);

/** The type's textual field values, space-joined, for the free-text column. */
function fieldText(row: SearchableItem): string {
  const type = row.typeKey ? findType(row.typeKey) : undefined;
  if (!type) return '';
  const fields = JSON.parse(row.fields) as Record<string, unknown>;
  const parts: string[] = [];
  for (const field of type.fields) {
    if (!TEXTUAL_KINDS.has(field.kind)) continue;
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
  const type = row.typeKey ? findType(row.typeKey) : undefined;
  db.run(sql`delete from items_fts where id = ${row.id}`);
  db.run(sql`
    insert into items_fts (id, name, code, note, type_label, field_text, external_ids)
    values (
      ${row.id}, ${row.name}, ${row.code ?? ''}, ${row.note ?? ''},
      ${type?.name ?? ''}, ${fieldText(row)}, ${externalIdsText(row)}
    )
  `);
}

/** Drop `id`'s entry from `items_fts`. No op in this slice removes an item, so nothing calls this yet. */
export function removeFromSearchIndex(db: CommandDb, id: string): void {
  db.run(sql`delete from items_fts where id = ${id}`);
}

/**
 * Rebuild `items_fts` from scratch against `rows`. Boot wiring (rebuilding
 * when `catalogue_version` changes) belongs to the sync layer (A5) that
 * knows the served catalogue's version; this is the primitive it will call.
 */
export function rebuildSearchIndex(db: CommandDb, rows: readonly SearchableItem[]): void {
  db.run(sql`delete from items_fts`);
  for (const row of rows) upsertSearchIndex(db, row);
}
