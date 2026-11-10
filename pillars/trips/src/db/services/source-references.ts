import { and, eq, isNull } from 'drizzle-orm';

import {
  captureAssociations,
  exploreMemberships,
  tripDocumentAssociations,
  decisionOptions,
  decisions,
  journeyLegs,
  journeyGroupMembers,
} from '../schema.js';
import { sameCaptureTarget } from './capture-target-identity.js';
import { hasResponsibilityForTarget } from './responsibility-references.js';
import { TripsServiceError } from './source-record.js';

import type { CaptureTarget, ExploreSource } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

type LocalTarget = Exclude<CaptureTarget, { kind: 'contact' }>;
type LocalSource = ExploreSource | LocalTarget;

/** Reject deletion or creation Undo while active typed source relations reference an identity. */
export function assertSourceUnreferenced(db: TripsDb, tripId: number, source: LocalSource): void {
  const member = db
    .select()
    .from(exploreMemberships)
    .where(eq(exploreMemberships.tripId, tripId))
    .all()
    .some(
      (row) =>
        row.removedAt === null && row.source.kind === source.kind && row.source.id === source.id
    );
  const associated = db
    .select()
    .from(captureAssociations)
    .where(eq(captureAssociations.tripId, tripId))
    .all()
    .some(
      (row) =>
        row.removedAt === null &&
        (source.kind === 'capture'
          ? row.captureId === source.id
          : sameCaptureTarget(row.target, source))
    );
  if (member || associated) throw new TripsServiceError('source_referenced');
}
/** Creation Undo preserves Documents links, active Decisions/responsibilities and Journey legs/group memberships. */
export function assertCreatedTargetUnreferenced(
  db: TripsDb,
  tripId: number,
  target: LocalTarget
): void {
  assertSourceUnreferenced(db, tripId, target);
  const document = db
    .select()
    .from(tripDocumentAssociations)
    .where(eq(tripDocumentAssociations.tripId, tripId))
    .all()
    .some((row) => row.targetKind === target.kind && row.targetId === target.id);
  const decision = db
    .select({ sources: decisionOptions.affectedSources })
    .from(decisionOptions)
    .innerJoin(decisions, eq(decisions.id, decisionOptions.decisionId))
    .where(and(eq(decisions.tripId, tripId), isNull(decisionOptions.removedAt)))
    .all()
    .some((row) =>
      row.sources.some((source) => source.kind === target.kind && source.id === target.id)
    );
  const responsibility =
    target.kind !== 'idea' && hasResponsibilityForTarget(db, tripId, target.kind, target.id);
  if (document || decision || responsibility) throw new TripsServiceError('source_undo_conflict');
  if (target.kind === 'journey') {
    const leg = db
      .select({ id: journeyLegs.id })
      .from(journeyLegs)
      .where(eq(journeyLegs.journeyId, target.id))
      .get();
    const group = db
      .select({ groupId: journeyGroupMembers.groupId })
      .from(journeyGroupMembers)
      .where(eq(journeyGroupMembers.journeyId, target.id))
      .get();
    if (leg !== undefined || group !== undefined)
      throw new TripsServiceError('source_undo_conflict');
  }
}
