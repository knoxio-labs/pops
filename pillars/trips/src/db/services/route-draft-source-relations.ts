import { routeDraftRecordSource, routeDraftSourceKey } from './route-draft-records.js';

import type { RoutePath } from '../../contract/route-schemas.js';
import type { RouteDraftRecord } from './route-draft-records.js';
import type { RouteDraftSnapshot } from './route-draft-snapshot.js';

/** Return only canonical Visit links owned by a source row. */
export function relatedVisitIds(record: RouteDraftRecord): number[] {
  switch (record.kind) {
    case 'stay':
    case 'event':
    case 'meeting':
      return record.row.visitId === null ? [] : [record.row.visitId];
    case 'rental':
      return [record.row.pickupVisitId, record.row.returnVisitId].filter((id) => id !== null);
    default:
      return [];
  }
}

function addAssociationIdentities(snapshot: RouteDraftSnapshot, shared: Set<string>): void {
  for (const association of snapshot.associations) {
    if (association.removedAt === null && association.target.kind !== 'contact') {
      shared.add(`${association.target.kind}:${association.target.id}`);
    }
  }
}

function addMembershipIdentities(snapshot: RouteDraftSnapshot, shared: Set<string>): void {
  for (const membership of snapshot.memberships) {
    if (membership.removedAt === null)
      shared.add(`${membership.source.kind}:${membership.source.id}`);
  }
}

function addOptionIdentities(snapshot: RouteDraftSnapshot, shared: Set<string>): void {
  for (const option of snapshot.options) {
    if (option.removedAt === null) {
      for (const source of option.affectedSources) shared.add(routeDraftSourceKey(source));
    }
  }
}

function addJourneyGroupIdentities(snapshot: RouteDraftSnapshot, shared: Set<string>): void {
  for (const group of snapshot.groups) shared.add(`journey:${group.currentJourneyId}`);
  for (const member of snapshot.groupMembers) shared.add(`journey:${member.journeyId}`);
}

function addCrossPathRentalIdentities(
  snapshot: RouteDraftSnapshot,
  path: RoutePath,
  shared: Set<string>
): void {
  const visits = new Set(
    path.members.filter((source) => source.kind === 'visit').map((source) => source.id)
  );
  for (const record of snapshot.records) {
    if (record.kind === 'rental' && relatedVisitIds(record).some((id) => !visits.has(id))) {
      shared.add(routeDraftSourceKey(routeDraftRecordSource(record)));
    }
  }
}

/** Identify records whose canonical relations make them shared beyond a draft path. */
export function sharedSourceIdentities(snapshot: RouteDraftSnapshot, path: RoutePath): Set<string> {
  const shared = new Set<string>();
  addAssociationIdentities(snapshot, shared);
  addMembershipIdentities(snapshot, shared);
  addOptionIdentities(snapshot, shared);
  addJourneyGroupIdentities(snapshot, shared);
  addCrossPathRentalIdentities(snapshot, path, shared);
  return shared;
}
