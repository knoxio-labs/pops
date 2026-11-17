import { z } from 'zod';

import { EventInputSchema } from './event-schemas.js';
import { JourneyInputSchema, JourneyLegInputSchema } from './journey-schemas.js';
import { SourceOperationResultSchema } from './source-workspace.js';
import { StayInputSchema } from './stay-schemas.js';

const Id = z.number().int().positive();
/** One explicitly selected stored original; processing tasks and caller digests are not originals. */
export const BookingOriginalSelectionSchema = z.strictObject({
  captureId: Id,
  expectedCaptureRevision: z.number().int().positive(),
  original: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('text') }),
    z.strictObject({ kind: z.literal('document'), documentId: Id }),
  ]),
});
/** Noncanonical extraction evidence distinguishes verified text from unverified PDF claims. */
export const BookingEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), quote: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('reported-pdf'),
    quote: z.string().min(1),
    page: z.number().int().positive().nullable(),
  }),
]);
/** Proposed facts remain strings and evidence, never inferred foreign identities or canonical writes. */
export const BookingFactSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('unknown'), values: z.tuple([]), evidence: z.tuple([]) }),
  z.strictObject({
    state: z.literal('stated'),
    values: z.tuple([z.string()]),
    evidence: z.array(BookingEvidenceSchema).min(1),
  }),
  z.strictObject({
    state: z.literal('ambiguous'),
    values: z
      .array(z.string())
      .min(2)
      .refine((values) => new Set(values).size === values.length),
    evidence: z.array(BookingEvidenceSchema).min(1),
  }),
]);
/** Producer-issued row identity is stable for a stored attempt, not across model segmentation. */
export const BookingProposalSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['event', 'journey', 'stay', 'unclassified']),
  facts: z.record(z.string(), BookingFactSchema),
});
/** Reviewed writes reuse canonical creation inputs; existing-target admission never edits the target. */
export const BookingReviewedTargetSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('createEvent'), input: EventInputSchema }),
  z.strictObject({
    mode: z.literal('createJourney'),
    input: JourneyInputSchema,
    legs: z.array(JourneyLegInputSchema).optional(),
  }),
  z.strictObject({ mode: z.literal('createStay'), input: StayInputSchema }),
  z.strictObject({
    mode: z.literal('existing'),
    target: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('event'), id: Id }),
      z.strictObject({ kind: z.literal('journey'), id: Id }),
      z.strictObject({ kind: z.literal('stay'), id: Id }),
    ]),
  }),
]);
/** A durable review decision binds exact approved fields and source revision independently of proposal IDs. */
export const BookingDecisionSchema = z.strictObject({
  id: z.uuid(),
  sourceId: z.uuid(),
  bindingId: z.uuid(),
  expectedSourceRevision: z.number().int().nonnegative(),
  expectedCaptureRevision: z.number().int().positive(),
  admission: z.enum(['initial', 'additional', 'existing']),
  attemptId: z.uuid(),
  proposalIds: z.array(z.uuid()),
  target: BookingReviewedTargetSchema,
  committedOperationId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
/** New UUID resolution names the original proof and never asserts a fresh mutation or Undo claim. */
export const BookingCommitResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('committed'),
    operationId: z.uuid(),
    results: z.array(SourceOperationResultSchema).min(1),
  }),
  z.strictObject({
    kind: z.literal('alreadyCommitted'),
    requestedOperationId: z.uuid(),
    originalOperationId: z.uuid(),
    results: z.array(SourceOperationResultSchema).min(1),
  }),
]);
/** Explicit original selection and its current Capture precondition. */
export type BookingOriginalSelection = z.infer<typeof BookingOriginalSelectionSchema>;
/** Unaccepted extraction fact with honest uncertainty. */
export type BookingFact = z.infer<typeof BookingFactSchema>;
/** Stored noncanonical proposal with producer-issued identity. */
export type BookingProposal = z.infer<typeof BookingProposalSchema>;
/** Canonical command selected by explicit review. */
export type BookingReviewedTarget = z.infer<typeof BookingReviewedTargetSchema>;
/** Persisted reviewed occurrence identity. */
export type BookingDecision = z.infer<typeof BookingDecisionSchema>;
/** Same-operation replay or explicit original-operation resolution. */
export type BookingCommitResult = z.infer<typeof BookingCommitResultSchema>;
