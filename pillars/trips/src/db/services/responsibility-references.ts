import { and, eq, isNotNull } from 'drizzle-orm';

import { arrangementResponsibilities } from '../schema.js';

import type { ResponsibilityTargetKind } from '../../contract/responsibilities.js';
import type { TripsDb } from '../index.js';

/** Check active responsibility inside a caller's transaction before undoing source creation. */
export function hasResponsibilityForTarget(
  db: Pick<TripsDb, 'select'>,
  tripId: number,
  targetKind: ResponsibilityTargetKind,
  targetId: number
): boolean {
  return (
    db
      .select({ id: arrangementResponsibilities.id })
      .from(arrangementResponsibilities)
      .where(
        and(
          eq(arrangementResponsibilities.tripId, tripId),
          eq(arrangementResponsibilities.targetKind, targetKind),
          eq(arrangementResponsibilities.targetId, targetId),
          isNotNull(arrangementResponsibilities.responsibility)
        )
      )
      .limit(1)
      .get() !== undefined
  );
}
