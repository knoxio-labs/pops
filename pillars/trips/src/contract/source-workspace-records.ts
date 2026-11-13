import { z } from 'zod';

import { CaptureJourneyLegSetSchema } from './capture-journey-target.js';
import { CaptureSchema } from './capture-schemas.js';
import { EventSchema } from './event-schemas.js';
import { IdeaContactLinkSchema, IdeaSchema } from './idea-schemas.js';
import { JourneySchema } from './journey-schemas.js';
import { StaySchema } from './stay-schemas.js';

const Id = z.number().int().positive();
const Revision = z.number().int().positive();
const Audit = {
  revision: Revision,
  removedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
/** Explicit identity of a source in Explore; labels never resolve these references. */
export const ExploreSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('capture'), id: Id }),
  z.object({ kind: z.literal('idea'), id: Id }),
  z.object({ kind: z.literal('event'), id: Id }),
]);
/** Explicit organisation target; capture identity is retained after association. */
export const CaptureTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idea'), id: Id }),
  z.object({ kind: z.literal('event'), id: Id }),
  z.object({ kind: z.literal('journey'), id: Id }),
  z.object({ kind: z.literal('stay'), id: Id }),
  z.object({ kind: z.literal('contact'), reference: IdeaContactLinkSchema }),
]);
/** Source-to-target provenance survives edits and removal; classification does not create this relation. */
export const CaptureAssociationSchema = z.object({
  id: Id,
  tripId: Id,
  captureId: Id,
  target: CaptureTargetSchema,
  provenance: z.enum(['existing', 'created']),
  sourceRevision: Revision,
  ...Audit,
});
/** Collection membership has its own identity and removal never deletes its source. */
export const ExploreMembershipSchema = z.object({
  id: Id,
  tripId: Id,
  source: ExploreSourceSchema,
  ...Audit,
});
/** Consistent transaction snapshot; tombstoned identities remain readable for retry and Undo. */
export const SourceWorkspaceSchema = z
  .object({
    captures: z.array(CaptureSchema),
    ideas: z.array(IdeaSchema),
    associations: z.array(CaptureAssociationSchema),
    memberships: z.array(ExploreMembershipSchema),
    events: z.array(EventSchema),
    journeys: z.array(JourneySchema),
    journeyLegSets: z.array(CaptureJourneyLegSetSchema).optional(),
    stays: z.array(StaySchema),
  })
  .meta({ id: 'CaptureWorkspace' });
