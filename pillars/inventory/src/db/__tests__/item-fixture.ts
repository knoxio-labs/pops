/**
 * Minimal `items` row seeding for db-layer suites whose subject is something
 * else (connections, documents, locations) and that only need an FK target.
 *
 * This inserts directly rather than going through the item write path: those
 * suites are not testing item creation, and depending on the api-layer writer
 * from a db-layer test would invert the layering.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { items } from '../schema.js';

import type { ItemRow } from '../row-types.js';
import type { InventoryDb } from '../services/internal.js';

/** Fields a seeded item may override; everything else takes a null default. */
export interface ItemFixtureOverrides {
  name: string;
  code?: string;
  legacyType?: string;
  /** Places the item at this location; absent leaves it in hand. */
  locationId?: string;
  /** Makes the item a container, open. */
  isContainer?: boolean;
}

/** Insert one `items` row and return it. */
export function seedInventoryItem(db: InventoryDb, overrides: ItemFixtureOverrides): ItemRow {
  const id = randomUUID();
  db.insert(items)
    .values({
      id,
      name: overrides.name,
      code: overrides.code ?? null,
      legacyType: overrides.legacyType ?? null,
      placementKind: overrides.locationId === undefined ? 'hand' : 'location',
      locationId: overrides.locationId ?? null,
      isContainer: overrides.isContainer === true ? 1 : 0,
      access: overrides.isContainer === true ? 'open' : null,
      inUse: 0,
      deductible: 0,
      lastEditedTime: new Date().toISOString(),
      seq: 0,
    })
    .run();

  const [row] = db.select().from(items).where(eq(items.id, id)).all();
  if (!row) throw new Error(`seedInventoryItem: row ${id} not readable after insert`);
  return row;
}
