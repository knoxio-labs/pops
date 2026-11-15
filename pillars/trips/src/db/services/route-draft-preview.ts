import { planRouteDraftDeletion } from './route-draft-plan.js';
import { readRouteDraftSnapshot } from './route-draft-snapshot.js';

import type {
  RouteDraftPreview,
  RouteDraftPreviewInput,
} from '../../contract/route-draft-schemas.js';
import type { TripsDb } from '../index.js';

/** Preview explicit canonical candidates without allocating identities or changing any source or route. */
export function previewRouteDraftDeletion(
  db: TripsDb,
  tripId: number,
  pathId: number,
  input: RouteDraftPreviewInput
): RouteDraftPreview {
  return db.transaction(
    (tx) => planRouteDraftDeletion(readRouteDraftSnapshot(tx, tripId), pathId, input),
    { behavior: 'deferred' }
  );
}
