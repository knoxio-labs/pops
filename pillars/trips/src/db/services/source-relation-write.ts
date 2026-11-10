import { and, eq } from 'drizzle-orm';

import {
  CaptureAssociationSchema,
  ExploreMembershipSchema,
} from '../../contract/source-workspace.js';
import { captureAssociations, exploreMemberships } from '../schema.js';
import { resolveOrganisationTarget } from './capture-create-target.js';
import { sameCaptureTarget } from './capture-target-identity.js';
import {
  getCapture,
  getCaptureAssociation,
  getExploreMembership,
  requireExploreSource,
  requireSourceRevision,
} from './source-queries.js';
import { TripsServiceError } from './source-record.js';
import { changeCaptureSource, nextSourceRevision } from './source-row-write.js';

import type { SourceCommand, ExploreSource } from '../../contract/source-workspace.js';
import type { SourceWrite } from './source-write-types.js';

/** Insert explicit collection membership after validating the source's current ownership. */
export function addExploreMembership(write: SourceWrite, source: ExploreSource): void {
  requireExploreSource(write.db, write.tripId, source);
  const exists = write.db
    .select()
    .from(exploreMemberships)
    .where(eq(exploreMemberships.tripId, write.tripId))
    .all()
    .some(
      (row) =>
        row.removedAt === null && row.source.kind === source.kind && row.source.id === source.id
    );
  if (exists) throw new TripsServiceError('source_revision_conflict');
  const after = ExploreMembershipSchema.parse(
    write.db.insert(exploreMemberships).values({ tripId: write.tripId, source }).returning().get()
  );
  write.receipt.memberships.push(after);
  write.inverse.memberships.push({ after, before: null });
}
/** Remove only a collection identity, retaining its source and the prior membership for Undo. */
export function removeExploreMembership(
  write: SourceWrite,
  command: Extract<SourceCommand, { kind: 'explore.remove' }>
): void {
  const before = getExploreMembership(write.db, write.tripId, command.id);
  requireSourceRevision(before, command.expectedRevision);
  const after = ExploreMembershipSchema.parse(
    write.db
      .update(exploreMemberships)
      .set({ ...nextSourceRevision(before), removedAt: new Date().toISOString() })
      .where(eq(exploreMemberships.id, before.id))
      .returning()
      .get()
  );
  write.receipt.memberships.push(after);
  write.inverse.memberships.push({ after, before });
}
/** Remove one organisation relation while retaining both source and target identities. */
export function removeCaptureAssociation(
  write: SourceWrite,
  command: Extract<SourceCommand, { kind: 'association.remove' }>
): void {
  const before = getCaptureAssociation(write.db, write.tripId, command.id);
  requireSourceRevision(before, command.expectedRevision);
  const after = CaptureAssociationSchema.parse(
    write.db
      .update(captureAssociations)
      .set({ ...nextSourceRevision(before), removedAt: new Date().toISOString() })
      .where(eq(captureAssociations.id, before.id))
      .returning()
      .get()
  );
  write.receipt.associations.push(after);
  write.inverse.associations.push({ after, before });
}
/** Atomically associate an explicit existing or newly described target, preserving capture provenance. */
export function organiseCapture(
  write: SourceWrite,
  command: Extract<SourceCommand, { kind: 'capture.organise' }>
): void {
  const before = getCapture(write.db, write.tripId, command.id);
  requireSourceRevision(before, command.expectedRevision);
  const target = resolveOrganisationTarget(write, command.target);
  const exists = write.db
    .select()
    .from(captureAssociations)
    .where(
      and(
        eq(captureAssociations.tripId, write.tripId),
        eq(captureAssociations.captureId, before.id)
      )
    )
    .all()
    .some((row) => row.removedAt === null && sameCaptureTarget(row.target, target));
  if (exists) throw new TripsServiceError('source_revision_conflict');
  const after = CaptureAssociationSchema.parse(
    write.db
      .insert(captureAssociations)
      .values({
        tripId: write.tripId,
        captureId: before.id,
        target,
        provenance: command.target.mode === 'existing' ? 'existing' : 'created',
        sourceRevision: before.revision,
      })
      .returning()
      .get()
  );
  write.receipt.associations.push(after);
  write.inverse.associations.push({ after, before: null });
  changeCaptureSource(write, before, {});
  if (command.explore) {
    if (target.kind !== 'idea' && target.kind !== 'event')
      throw new TripsServiceError('source_target_invalid');
    addExploreMembership(write, target);
  }
}
