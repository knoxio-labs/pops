/**
 * Boot-time rebuild of `items_fts` after migration `0015_items_fts_trigram`
 * drops and recreates it with SQLite's trigram tokenizer (POPS-4158). It
 * lives outside the SQL migration because a row's `field_text` and
 * `external_ids` columns depend on `findType` and each item type's field
 * kinds — the same reason `search-index.ts` populates `items_fts` from the
 * command layer rather than triggers.
 */
import { rebuildSearchIndex, type SearchableItem } from '../domain/commands/search-index.js';
import { items } from './schema.js';

import type { InventoryDb } from './services/internal.js';

/** Every row currently in `items`, in the shape {@link rebuildSearchIndex} needs. */
function loadSearchableItems(db: InventoryDb): SearchableItem[] {
  return db
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
}

/**
 * Rebuild `items_fts` from every row in `items`, regardless of lifecycle or
 * tombstone state — matching what the command layer already keeps there
 * (nothing prunes `items_fts` on delete or retirement; `search-handlers.ts`
 * filters lifecycle at query time, not the index).
 */
export function rebuildSearchIndexFromItems(db: InventoryDb): void {
  rebuildSearchIndex(db, loadSearchableItems(db));
}
