import { and, eq } from 'drizzle-orm';

import { arrangementResponsibilities } from '../schema.js';

import type { ResponsibilityTargetKind } from '../../contract/responsibilities.js';
import type { TripsDb } from '../index.js';

/** Remove only the deleted target's association within its owner's deletion transaction. */
export function deleteResponsibilityForTarget(
  db: Pick<TripsDb, 'delete'>,
  tripId: number,
  targetKind: ResponsibilityTargetKind,
  targetId: number
): void {
  db.delete(arrangementResponsibilities)
    .where(
      and(
        eq(arrangementResponsibilities.tripId, tripId),
        eq(arrangementResponsibilities.targetKind, targetKind),
        eq(arrangementResponsibilities.targetId, targetId)
      )
    )
    .run();
}
