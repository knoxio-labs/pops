import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { CaptureCreateJourneyTargetSchema } from './capture-journey-target.js';
import {
  CaptureAttachmentSchema,
  CaptureInputSchema,
  CapturePatchSchema,
} from './capture-schemas.js';
import { EventInputSchema } from './event-schemas.js';
import { IdeaInputSchema } from './idea-schemas.js';
import {
  type CaptureAssociationSchema,
  CaptureTargetSchema,
  type ExploreMembershipSchema,
  ExploreSourceSchema,
  SourceWorkspaceSchema,
} from './source-workspace-records.js';
import { StayInputSchema } from './stay-schemas.js';

export {
  CaptureCreateJourneyTargetSchema,
  CaptureJourneyLegSetSchema,
} from './capture-journey-target.js';
export type { CaptureJourneyLegSet } from './capture-journey-target.js';
export {
  CaptureAssociationSchema,
  CaptureTargetSchema,
  ExploreMembershipSchema,
  ExploreSourceSchema,
  SourceWorkspaceSchema,
} from './source-workspace-records.js';

const Id = z.number().int().positive();
const Revision = z.number().int().positive();
const Guard = { id: Id, expectedRevision: Revision };
const OrganiseTarget = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), target: CaptureTargetSchema }),
  z.object({ mode: z.literal('createIdea'), input: IdeaInputSchema }),
  z.object({ mode: z.literal('createEvent'), input: EventInputSchema }),
  CaptureCreateJourneyTargetSchema,
  z.object({ mode: z.literal('createStay'), input: StayInputSchema }),
]);
const Commands = {
  captureCreate: z.object({
    kind: z.literal('capture.create'),
    input: CaptureInputSchema,
    target: OrganiseTarget.optional(),
    explore: z.boolean().optional(),
  }),
  captureUpdate: z.object({
    kind: z.literal('capture.update'),
    ...Guard,
    input: CapturePatchSchema,
  }),
  captureAttach: z.object({
    kind: z.literal('capture.attach'),
    ...Guard,
    attachment: CaptureAttachmentSchema,
  }),
  captureRemove: z.object({ kind: z.literal('capture.remove'), ...Guard }),
  captureOrganise: z.object({
    kind: z.literal('capture.organise'),
    ...Guard,
    target: OrganiseTarget,
    explore: z.boolean().optional(),
  }),
  associationRemove: z.object({ kind: z.literal('association.remove'), ...Guard }),
  ideaCreate: z.object({
    kind: z.literal('idea.create'),
    input: IdeaInputSchema,
    explore: z.boolean().optional(),
  }),
  ideaUpdate: z.object({ kind: z.literal('idea.update'), ...Guard, input: IdeaInputSchema }),
  ideaRemove: z.object({ kind: z.literal('idea.remove'), ...Guard }),
  exploreAdd: z.object({ kind: z.literal('explore.add'), source: ExploreSourceSchema }),
  exploreRemove: z.object({ kind: z.literal('explore.remove'), ...Guard }),
  undo: z.object({ kind: z.literal('undo'), targetOperationId: z.uuid() }),
};
/** Explicit source operations; every write is replayable by its trip-scoped operation UUID. */
export const SourceCommandSchema = z.discriminatedUnion('kind', [
  Commands.captureCreate,
  Commands.captureUpdate,
  Commands.captureAttach,
  Commands.captureRemove,
  Commands.captureOrganise,
  Commands.associationRemove,
  Commands.ideaCreate,
  Commands.ideaUpdate,
  Commands.ideaRemove,
  Commands.exploreAdd,
  Commands.exploreRemove,
  Commands.undo,
]);
/** UUID reuse requires identical canonical typed input, including after the original was undone. */
export const SourceOperationSchema = z.object({
  operationId: z.uuid(),
  command: SourceCommandSchema,
});
/** Stable receipt records only records touched by this operation, never an old whole-workspace restore. */
export const SourceReceiptSchema = SourceWorkspaceSchema.extend({
  operationId: z.uuid(),
  undoneOperationId: z.uuid().nullable(),
}).meta({ id: 'CaptureOperationReceipt' });
/** Replay distinguishes the immutable original outcome from current affected records and Undo state. */
export const SourceOperationResultSchema = z
  .object({
    receipt: SourceReceiptSchema,
    current: SourceWorkspaceSchema,
    undone: z.boolean(),
    replayed: z.boolean(),
  })
  .meta({ id: 'CaptureOperationResult' });
/** Current state and durable original receipt of a source operation. */
export type SourceOperationResult = z.infer<typeof SourceOperationResultSchema>;
/** A source mutation's public command. */
export type SourceCommand = z.infer<typeof SourceCommandSchema>;
/** Trip-scoped replay envelope. */
export type SourceOperation = z.infer<typeof SourceOperationSchema>;
/** Persisted mutation response, replayed without writes. */
export type SourceReceipt = z.infer<typeof SourceReceiptSchema>;
/** One consistent source workspace snapshot. */
export type SourceWorkspace = z.infer<typeof SourceWorkspaceSchema>;
/** Explicit membership source. */
export type ExploreSource = z.infer<typeof ExploreSourceSchema>;
/** Capture organisation target. */
export type CaptureTarget = z.infer<typeof CaptureTargetSchema>;
/** Persisted capture provenance. */
export type CaptureAssociation = z.infer<typeof CaptureAssociationSchema>;
/** Independently removable Explore membership. */
export type ExploreMembership = z.infer<typeof ExploreMembershipSchema>;

const c = initContract();
const Trip = z.object({ tripId: z.coerce.number().int().positive() });
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema, 409: ErrorBodySchema };
function action<Command extends z.ZodType<SourceCommand>>(
  path: string,
  command: Command
): {
  method: 'POST';
  path: string;
  pathParams: typeof Trip;
  body: z.ZodObject<{ operationId: ReturnType<typeof z.uuid>; command: Command }>;
  responses: { 200: typeof SourceOperationResultSchema } & typeof errors;
} {
  return {
    method: 'POST' as const,
    path,
    pathParams: Trip,
    body: z.object({ operationId: z.uuid(), command }),
    responses: { 200: SourceOperationResultSchema, ...errors },
  };
}
/** Atomic capture, idea and Explore snapshot. */
export const captureWorkspaceContract = c.router({
  get: {
    method: 'GET',
    path: '/trips/:tripId/capture-workspace',
    pathParams: Trip,
    responses: { 200: SourceWorkspaceSchema, ...errors },
  },
});
/** Individually scoped capture actions and capture-only Undo, sharing durable operation receipts. */
export const capturesContract = c.router({
  create: action('/trips/:tripId/captures/create', Commands.captureCreate),
  update: action('/trips/:tripId/captures/update', Commands.captureUpdate),
  attach: action('/trips/:tripId/captures/attach', Commands.captureAttach),
  remove: action('/trips/:tripId/captures/remove', Commands.captureRemove),
  organise: action('/trips/:tripId/captures/organise', Commands.captureOrganise),
  removeAssociation: action(
    '/trips/:tripId/captures/remove-association',
    Commands.associationRemove
  ),
  undo: action('/trips/:tripId/captures/undo', Commands.undo),
});
/** Individually scoped idea actions and idea-only Undo; no action appends to the route. */
export const ideasContract = c.router({
  create: action('/trips/:tripId/ideas/create', Commands.ideaCreate),
  update: action('/trips/:tripId/ideas/update', Commands.ideaUpdate),
  remove: action('/trips/:tripId/ideas/remove', Commands.ideaRemove),
  undo: action('/trips/:tripId/ideas/undo', Commands.undo),
});
/** Explicit collection membership actions; source records survive collection removal. */
export const exploreContract = c.router({
  add: action('/trips/:tripId/explore/add', Commands.exploreAdd),
  remove: action('/trips/:tripId/explore/remove', Commands.exploreRemove),
  undo: action('/trips/:tripId/explore/undo', Commands.undo),
});
