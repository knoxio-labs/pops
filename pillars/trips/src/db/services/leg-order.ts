import { and, eq } from 'drizzle-orm';

import { journeyLegs } from '../schema.js';

import type { TripsDb } from '../index.js';

/** Write already-validated explicit order inside a guarded transaction without altering source facts or timestamps. */
export function writeLegOrder(db: TripsDb, journeyId: number, legIds: readonly number[]): void {
  for (const [position, id] of legIds.entries())
    db.update(journeyLegs)
      .set({ position })
      .where(and(eq(journeyLegs.journeyId, journeyId), eq(journeyLegs.id, id)))
      .run();
}
