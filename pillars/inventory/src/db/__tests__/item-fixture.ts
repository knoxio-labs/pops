/**
 * Minimal `home_inventory` row seeding for db-layer suites whose subject is
 * something else (connections, documents) and that only need an FK target.
 *
 * This inserts directly rather than going through the item write path: those
 * suites are not testing item creation, and depending on the api-layer writer
 * from a db-layer test would invert the layering.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { homeInventory } from '../schema.js';

import type { InventoryRow } from '../row-types.js';
import type { InventoryDb } from '../services/internal.js';

/** Fields a seeded item may override; everything else takes a null default. */
export interface ItemFixtureOverrides {
  itemName: string;
  assetId?: string;
  type?: string;
}

/** Insert one `home_inventory` row and return it. */
export function seedInventoryItem(db: InventoryDb, overrides: ItemFixtureOverrides): InventoryRow {
  const id = randomUUID();
  db.insert(homeInventory)
    .values({
      id,
      itemName: overrides.itemName,
      assetId: overrides.assetId ?? null,
      type: overrides.type ?? null,
      inUse: 0,
      deductible: 0,
      lastEditedTime: new Date().toISOString(),
    })
    .run();

  const [row] = db.select().from(homeInventory).where(eq(homeInventory.id, id)).all();
  if (!row) throw new Error(`seedInventoryItem: row ${id} not readable after insert`);
  return row;
}
