/**
 * Minimal `locations` row seeding for db-layer suites whose subject is the
 * read surface (`locations.ts`, `locations-queries.ts`), not location
 * creation.
 *
 * This inserts directly rather than going through the command engine: those
 * suites are not testing `location.create`, and depending on the command
 * layer from a db-layer test would invert the layering.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { locations } from '../schema.js';

import type { LocationRow } from '../row-types.js';
import type { InventoryDb } from '../services/internal.js';

/** Fields a seeded location may override; everything else takes its column default. */
export interface LocationFixtureOverrides {
  name: string;
  parentId?: string;
  sortOrder?: number;
}

/** Insert one `locations` row and return it. */
export function seedLocation(db: InventoryDb, overrides: LocationFixtureOverrides): LocationRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(locations)
    .values({
      id,
      name: overrides.name,
      parentId: overrides.parentId ?? null,
      sortOrder: overrides.sortOrder ?? 0,
      lastEditedTime: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const [row] = db.select().from(locations).where(eq(locations.id, id)).all();
  if (!row) throw new Error(`seedLocation: row ${id} not readable after insert`);
  return row;
}
