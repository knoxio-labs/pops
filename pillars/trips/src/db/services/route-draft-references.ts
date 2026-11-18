import { routeDraftFingerprint, routeDraftSourceKey } from './route-draft-records.js';

import type { RouteDraftSource } from '../../contract/route-draft-schemas.js';
import type { RouteDraftSnapshot } from './route-draft-snapshot.js';

type LocationReference =
  | { source: { kind: 'stay' | 'event' | 'meeting'; id: number }; visitId: number }
  | {
      source: { kind: 'rental'; id: number };
      pickupVisitId: number | null;
      returnVisitId: number | null;
    };

function referenceKeys(sources: RouteDraftSource[]): Set<string> {
  const keys = new Set(sources.map(routeDraftSourceKey));
  for (const source of sources) {
    if (source.kind === 'journey-leg') keys.add(`journey:${source.journeyId}`);
  }
  return keys;
}

function locationReferences(snapshot: RouteDraftSnapshot, keys: Set<string>): LocationReference[] {
  const locations: LocationReference[] = [];
  for (const record of snapshot.records) {
    if (record.kind === 'stay' || record.kind === 'event' || record.kind === 'meeting') {
      if (record.row.visitId !== null && keys.has(`visit:${record.row.visitId}`)) {
        locations.push({
          source: { kind: record.kind, id: record.row.id },
          visitId: record.row.visitId,
        });
      }
    } else if (
      record.kind === 'rental' &&
      ((record.row.pickupVisitId !== null && keys.has(`visit:${record.row.pickupVisitId}`)) ||
        (record.row.returnVisitId !== null && keys.has(`visit:${record.row.returnVisitId}`)))
    ) {
      locations.push({
        source: { kind: record.kind, id: record.row.id },
        pickupVisitId: record.row.pickupVisitId,
        returnVisitId: record.row.returnVisitId,
      });
    }
  }
  return locations;
}

function referencedState(snapshot: RouteDraftSnapshot, keys: Set<string>): object {
  const references = (kind: string, id: number): boolean => keys.has(`${kind}:${id}`);
  return {
    captures: snapshot.captures.filter(
      (row) => row.visitId !== null && references('visit', row.visitId)
    ),
    ideas: snapshot.ideas.filter((row) => row.visitId !== null && references('visit', row.visitId)),
    associations: snapshot.associations.filter(
      (row) => row.target.kind !== 'contact' && references(row.target.kind, row.target.id)
    ),
    memberships: snapshot.memberships.filter((row) => references(row.source.kind, row.source.id)),
    options: snapshot.options.filter((row) =>
      row.affectedSources.some((source) => references(source.kind, source.id))
    ),
    groups: snapshot.groups.filter(
      (row) =>
        references('journey', row.currentJourneyId) ||
        snapshot.groupMembers.some(
          (member) => member.groupId === row.id && references('journey', member.journeyId)
        )
    ),
    groupMembers: snapshot.groupMembers.filter((row) => references('journey', row.journeyId)),
    documents: snapshot.documents.filter((row) => references(row.targetKind, row.targetId)),
    responsibilities: snapshot.responsibilities.filter((row) =>
      references(row.targetKind, row.targetId)
    ),
    locations: locationReferences(snapshot, keys),
  };
}

/** Guard only relations that could adopt a removed identity or change an affected Journey's shared use. */
export function routeDraftReferenceGuard(
  snapshot: RouteDraftSnapshot,
  sources: RouteDraftSource[]
): string {
  return routeDraftFingerprint(referencedState(snapshot, referenceKeys(sources)));
}
