import type { TripDocumentTargetRecord } from './api';
import type { DocumentAssociationTarget, TripDocumentAssociation } from './types';

/** A stable explicit target group; source identities are never matched by place or time. */
export interface DocumentTargetGroup {
  target: DocumentAssociationTarget;
  associations: TripDocumentAssociation[];
  visitId: number | null;
}

/** Visit grouping uses only canonical explicit source membership. */
export interface VisitDocumentGroup {
  visitId: number;
  targets: DocumentTargetGroup[];
}

/** Put trip-wide originals first and retain every other explicit target identity. */
export function groupDocumentAssociations(
  associations: readonly TripDocumentAssociation[],
  visitOrder: readonly number[] = [],
  targetRecords: ReadonlyMap<string, TripDocumentTargetRecord> = new Map()
): {
  trip: TripDocumentAssociation[];
  visits: VisitDocumentGroup[];
  targets: DocumentTargetGroup[];
} {
  const trip: TripDocumentAssociation[] = [];
  const groups = new Map<string, DocumentTargetGroup>();
  for (const association of associations) {
    if (association.targetKind === 'trip' && association.targetId === association.tripId) {
      trip.push(association);
      continue;
    }
    const key = `${association.targetKind}:${String(association.targetId)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.associations.push(association);
    } else {
      groups.set(key, {
        target: { kind: association.targetKind, id: association.targetId },
        associations: [association],
        visitId: associationVisitId(association, targetRecords),
      });
    }
  }
  const routePosition = new Map(visitOrder.map((id, index) => [id, index]));
  const targets = [...groups.values()];
  targets.sort((left, right) => {
    if (left.visitId !== null && right.visitId !== null) {
      return (
        (routePosition.get(left.visitId) ?? Number.MAX_SAFE_INTEGER) -
        (routePosition.get(right.visitId) ?? Number.MAX_SAFE_INTEGER)
      );
    }
    if (left.visitId !== null) return -1;
    if (right.visitId !== null) return 1;
    return 0;
  });
  const visits = new Map<number, VisitDocumentGroup>();
  const ungrouped: DocumentTargetGroup[] = [];
  for (const target of targets) {
    if (target.visitId === null) {
      ungrouped.push(target);
      continue;
    }
    const visit = visits.get(target.visitId) ?? { visitId: target.visitId, targets: [] };
    visit.targets.push(target);
    visits.set(target.visitId, visit);
  }
  return { trip, visits: [...visits.values()], targets: ungrouped };
}

/** Describe a source group without claiming a route position or resolved source label. */
export function documentTargetLabel(
  target: DocumentAssociationTarget,
  names: ReadonlyMap<string, TripDocumentTargetRecord> = new Map()
): string {
  const resolved = names.get(`${target.kind}:${String(target.id)}`)?.name;
  if (resolved !== undefined) return resolved;
  const kind = target.kind[0]?.toUpperCase() + target.kind.slice(1);
  return `${kind} ${String(target.id)}`;
}

/** Validate against the owner's live allowlist and cap, without inventing a fallback policy. */
export function uploadFileProblem(
  file: Pick<File, 'name' | 'size' | 'type'>,
  policy: {
    configured: boolean;
    available: boolean;
    maxUploadBytes: number;
    allowedMimeTypes: string[];
  } | null
): string | undefined {
  if (policy === null || !policy.configured || !policy.available) {
    return 'Documents is unavailable. The file has not been uploaded.';
  }
  if (file.size > policy.maxUploadBytes) {
    return `${file.name} exceeds the Documents upload limit of ${String(policy.maxUploadBytes)} bytes.`;
  }
  const [mimeCategory] = file.type.split('/', 1);
  const mimeAllowed = policy.allowedMimeTypes.some(
    (allowed) => allowed === file.type || allowed === `${mimeCategory}/*`
  );
  if (!mimeAllowed) {
    return `${file.name} has an unsupported file type. Documents allows ${policy.allowedMimeTypes.join(', ')}.`;
  }
  return undefined;
}

function associationVisitId(
  association: TripDocumentAssociation,
  targets: ReadonlyMap<string, TripDocumentTargetRecord>
): number | null {
  if (association.targetKind === 'visit') return association.targetId;
  return targets.get(`${association.targetKind}:${String(association.targetId)}`)?.visitId ?? null;
}
