import { and, eq } from 'drizzle-orm';

import { tripDocumentAssociations } from '../schema.js';

import type { DocumentTargetKind } from '../../contract/document-associations.js';
import type { TripsDb } from '../index.js';

/** Delete memberships for a live target inside the caller's transaction. */
export function deleteDocumentAssociationsForTarget(
  db: Pick<TripsDb, 'delete'>,
  tripId: number,
  targetKind: Extract<DocumentTargetKind, 'event' | 'journey' | 'stay'>,
  targetId: number
): void {
  db.delete(tripDocumentAssociations)
    .where(
      and(
        eq(tripDocumentAssociations.tripId, tripId),
        eq(tripDocumentAssociations.targetKind, targetKind),
        eq(tripDocumentAssociations.targetId, targetId)
      )
    )
    .run();
}
