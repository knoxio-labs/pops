import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { locations } from '../../db/index.js';
import { diffAgainst } from './conflicts.js';
import { CommandRejected } from './errors.js';
import { parseFieldValue, placementSchema } from './item-fields.js';
import { assertPlacementAllowed } from './placement.js';

import type { CommandDb, FieldValues, LoadedEntity } from './entities.js';

const idListSchema = z.array(z.object({ id: z.string() }));

/** `locationId` and every place above it. `UNION` ends the walk on a cycle already in the data. */
function locationAncestry(db: CommandDb, locationId: string): string[] {
  const rows = db.all(sql`
    WITH RECURSIVE ancestry(id) AS (
      SELECT ${locationId}
      UNION
      SELECT l.parent_id FROM locations l JOIN ancestry ON l.id = ancestry.id
      WHERE l.parent_id IS NOT NULL
    )
    SELECT id FROM ancestry`);
  return idListSchema.parse(rows).map((row) => row.id);
}

function assertParentAllowed(db: CommandDb, locationId: string, parentId: string | null): void {
  if (parentId === null) return;
  const parent = db
    .select({ deletedAt: locations.deletedAt })
    .from(locations)
    .where(eq(locations.id, parentId))
    .get();
  if (!parent || parent.deletedAt !== null) {
    throw new CommandRejected('target_missing', `location ${parentId} does not exist`);
  }
  if (locationAncestry(db, parentId).includes(locationId)) {
    throw new CommandRejected('cycle', `location ${locationId} cannot sit inside itself`);
  }
}

/**
 * Refuse changes that would point a row somewhere it cannot be: an item's new
 * placement (see `assertPlacementAllowed`), or a place's new parent that is
 * missing, tombstoned, or the place itself or one of its descendants. Only
 * fields whose value actually changes are checked, so an op that restates the
 * current value is never refused over a target that has since gone. The
 * engine runs this for every update op, whatever produced the changes.
 */
export function validateChanges(db: CommandDb, entity: LoadedEntity, changes: FieldValues): void {
  const diff = diffAgainst(entity, changes);
  if (entity.kind === 'item' && diff.placement !== undefined) {
    const to = parseFieldValue(placementSchema, 'placement', diff.placement);
    assertPlacementAllowed(db, entity.row.id, to);
  }
  if (entity.kind === 'location' && diff.parentId !== undefined) {
    const parentId = parseFieldValue(z.string().min(1).nullable(), 'parentId', diff.parentId);
    assertParentAllowed(db, entity.row.id, parentId);
  }
}
