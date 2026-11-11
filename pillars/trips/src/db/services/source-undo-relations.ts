import { eq } from 'drizzle-orm';

import {
  CaptureAssociationSchema,
  ExploreMembershipSchema,
} from '../../contract/source-workspace.js';
import { captureAssociations, exploreMemberships } from '../schema.js';
import { sameCaptureTarget } from './capture-target-identity.js';
import { requireCaptureTarget } from './capture-targets.js';
import {
  getCaptureAssociation,
  getExploreMembership,
  requireExploreSource,
} from './source-queries.js';
import { TripsServiceError } from './source-record.js';
import { acknowledgeSourceInverse } from './source-undo-lineage.js';
import { guardSourceInverse, restoreSourceInverse } from './source-undo-row.js';

import type { SourceInverse } from './source-inverse-types.js';
import type { SourceWrite } from './source-write-types.js';

/** Reverse only owned relation rows after checking current identities and uniqueness dependencies. */
export function restoreSourceRelations(write: SourceWrite, inverse: SourceInverse): void {
  for (const entry of inverse.memberships) {
    guardSourceInverse(getExploreMembership(write.db, write.tripId, entry.after.id), entry.after);
    if (entry.before?.removedAt === null) requireRestorableMembership(write, entry.before);
    const after = ExploreMembershipSchema.parse(
      write.db
        .update(exploreMemberships)
        .set(restoreSourceInverse(entry.before, entry.after))
        .where(eq(exploreMemberships.id, entry.after.id))
        .returning()
        .get()
    );
    write.receipt.memberships.push(after);
    acknowledgeSourceInverse(write, entry.before, after, (inverse) => inverse.memberships);
  }
  for (const entry of inverse.associations) {
    guardSourceInverse(getCaptureAssociation(write.db, write.tripId, entry.after.id), entry.after);
    if (entry.before?.removedAt === null) {
      requireExploreSource(write.db, write.tripId, { kind: 'capture', id: entry.before.captureId });
      requireCaptureTarget(write.db, write.tripId, entry.before.target);
      const duplicate = write.db
        .select()
        .from(captureAssociations)
        .where(eq(captureAssociations.tripId, write.tripId))
        .all()
        .some(
          (row) =>
            row.id !== entry.after.id &&
            row.removedAt === null &&
            row.captureId === entry.after.captureId &&
            sameCaptureTarget(row.target, entry.after.target)
        );
      if (duplicate) throw new TripsServiceError('source_undo_conflict');
    }
    const after = CaptureAssociationSchema.parse(
      write.db
        .update(captureAssociations)
        .set(restoreSourceInverse(entry.before, entry.after))
        .where(eq(captureAssociations.id, entry.after.id))
        .returning()
        .get()
    );
    write.receipt.associations.push(after);
    acknowledgeSourceInverse(write, entry.before, after, (inverse) => inverse.associations);
  }
}
function requireRestorableMembership(
  write: SourceWrite,
  membership: SourceInverse['memberships'][number]['after']
): void {
  requireExploreSource(write.db, write.tripId, membership.source);
  const duplicate = write.db
    .select()
    .from(exploreMemberships)
    .where(eq(exploreMemberships.tripId, write.tripId))
    .all()
    .some(
      (row) =>
        row.id !== membership.id &&
        row.removedAt === null &&
        row.source.kind === membership.source.kind &&
        row.source.id === membership.source.id
    );
  if (duplicate) throw new TripsServiceError('source_undo_conflict');
}
