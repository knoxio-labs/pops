import { planDeletionSources } from './route-draft-preservation.js';
import {
  routeDraftFingerprint,
  routeDraftRecordRemoved,
  routeDraftRecordSource,
  routeDraftSourceKey,
} from './route-draft-records.js';
import { relatedVisitIds } from './route-draft-source-relations.js';
import { requireAlternative } from './route-membership.js';
import { TripsServiceError } from './source-record.js';

import type {
  RouteDraftPreview,
  RouteDraftPreviewInput,
} from '../../contract/route-draft-schemas.js';
import type { RoutePath } from '../../contract/route-schemas.js';
import type { RouteDraftRecord } from '../schema/route-draft-types.js';
import type { RouteDraftSnapshot } from './route-draft-snapshot.js';

function candidatesForPath(snapshot: RouteDraftSnapshot, path: RoutePath): RouteDraftRecord[] {
  const direct = new Set(path.members.map(routeDraftSourceKey));
  if (direct.size !== path.members.length) throw new TripsServiceError('route_draft_conflict');
  const visitIds = new Set(
    path.members.filter((member) => member.kind === 'visit').map((member) => member.id)
  );
  const journeyIds = new Set(
    path.members.filter((member) => member.kind === 'journey').map((member) => member.id)
  );
  const candidates = snapshot.records.filter((record) => {
    if (routeDraftRecordRemoved(record)) return false;
    if (direct.has(routeDraftSourceKey(routeDraftRecordSource(record)))) return true;
    if (record.kind === 'journey-leg') return journeyIds.has(record.row.journeyId);
    return relatedVisitIds(record).some((id) => visitIds.has(id));
  });
  const available = new Set(
    candidates.map((record) => routeDraftSourceKey(routeDraftRecordSource(record)))
  );
  if ([...direct].some((key) => !available.has(key)))
    throw new TripsServiceError('route_draft_conflict');
  return candidates;
}

function activePlacementGuard(snapshot: RouteDraftSnapshot, path: RoutePath): void {
  const active = [
    ...snapshot.route.order.filter((item) => item.kind !== 'gap'),
    ...snapshot.route.paths
      .filter((item) => item.state === 'alternative')
      .flatMap((item) => item.members),
  ];
  if (
    new Set(active.map(routeDraftSourceKey)).size !== active.length ||
    !snapshot.route.order.some((item) => item.kind === 'gap' && item.id === path.gapId)
  ) {
    throw new TripsServiceError('route_draft_conflict');
  }
}

/** Resolve only explicit canonical selection and compute confirmed/shared/context preservation to a fixed point. */
export function planRouteDraftDeletion(
  snapshot: RouteDraftSnapshot,
  pathId: number,
  input: RouteDraftPreviewInput
): RouteDraftPreview {
  const path = requireAlternative(snapshot.route, pathId);
  activePlacementGuard(snapshot, path);
  const records = candidatesForPath(snapshot, path);
  const deletion = planDeletionSources(snapshot, records, path, input);
  return {
    tripId: snapshot.route.tripId,
    pathId,
    revision: snapshot.route.revision,
    fingerprint: routeDraftFingerprint({ snapshot, selection: deletion.selection }),
    candidates: deletion.candidates,
    selection: deletion.selection,
  };
}
