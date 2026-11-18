import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import {
  BookingCommitResultSchema,
  BookingDecisionSchema,
  BookingOriginalSelectionSchema,
  BookingProposalSchema,
  BookingReviewedTargetSchema,
} from './booking-import-values.js';
import { SourceOperationResultSchema } from './source-workspace.js';

/** Server-verified content identity; presentation metadata and provider output never select its digest. */
export const BookingImportSourceSchema = z.strictObject({
  id: z.uuid(),
  tripId: z.number().int().positive(),
  representation: z.enum(['stored-text-json-v1', 'document-bytes-v1']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  byteLength: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  latestAttemptId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
/** Immutable binding records which actual Capture/original was verified, without duplicating its bytes. */
export const BookingSourceBindingSchema = z.strictObject({
  id: z.uuid(),
  sourceId: z.uuid(),
  selection: BookingOriginalSelectionSchema,
  documentsOrigin: z.url().nullable(),
  mediaType: z.enum(['text/plain', 'application/pdf']),
  createdAt: z.iso.datetime(),
});
/** A durable Trips claim permits at most one outbound one-shot AI invocation, not exactly-once provider execution. */
export const BookingExtractionAttemptSchema = z.strictObject({
  id: z.uuid(),
  sourceId: z.uuid(),
  bindingId: z.uuid(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  predecessorId: z.uuid().nullable(),
  state: z.enum(['prepared', 'claimed', 'succeeded', 'refused', 'outcome_unknown']),
  proposals: z.array(BookingProposalSchema),
  failure: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
/** The current accepted/undone bindings are read alongside immutable original operation proofs. */
export const BookingImportSnapshotSchema = z.strictObject({
  source: BookingImportSourceSchema,
  bindings: z.array(BookingSourceBindingSchema),
  attempts: z.array(BookingExtractionAttemptSchema),
  decisions: z.array(BookingDecisionSchema),
  accepted: z.array(z.strictObject({ decisionId: z.uuid(), result: SourceOperationResultSchema })),
});
const SourceParams = z.strictObject({
  tripId: z.coerce.number().int().positive(),
  sourceId: z.uuid(),
});
const TripParams = z.strictObject({ tripId: z.coerce.number().int().positive() });
const RequestId = { operationId: z.uuid() };
const ExplicitModelId = z
  .string()
  .refine((value) => value.trim().length > 0, 'Select a configured provider or model');
/** Exact bind replay avoids re-fetching an already verified immutable original. */
export const BookingBindInputSchema = z.strictObject({
  ...RequestId,
  selection: BookingOriginalSelectionSchema,
});
/** A deliberate new attempt names its current predecessor and explicitly selected configured model. */
export const BookingExtractInputSchema = z.strictObject({
  ...RequestId,
  bindingId: z.uuid(),
  expectedSourceRevision: z.number().int().nonnegative(),
  predecessorId: z.uuid().nullable(),
  providerId: ExplicitModelId,
  modelId: ExplicitModelId,
});
/** Several explicit decisions may be reviewed together; no source-level completion shortcut exists. */
export const BookingReviewInputSchema = z.strictObject({
  ...RequestId,
  bindingId: z.uuid(),
  attemptId: z.uuid(),
  expectedSourceRevision: z.number().int().nonnegative(),
  expectedCaptureRevision: z.number().int().positive(),
  admission: z.enum(['initial', 'additional', 'existing']),
  decisions: z
    .array(z.strictObject({ proposalIds: z.array(z.uuid()), target: BookingReviewedTargetSchema }))
    .min(1),
});
/** One atomic batch keeps distinct explicit booking decisions together and resolves duplicates without recreating. */
export const BookingCommitInputSchema = z.strictObject({
  ...RequestId,
  decisionIds: z.array(z.uuid()).min(1),
});
const errors = {
  400: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
  503: ErrorBodySchema,
};
const c = initContract();
/** Finite source, extraction, review and commit operations; no inference endpoint writes a canonical booking. */
export const bookingImportsContract = c.router({
  bind: {
    method: 'POST',
    path: '/trips/:tripId/booking-imports',
    pathParams: TripParams,
    body: BookingBindInputSchema,
    responses: { 200: BookingSourceBindingSchema, ...errors },
  },
  get: {
    method: 'GET',
    path: '/trips/:tripId/booking-imports/:sourceId',
    pathParams: SourceParams,
    responses: { 200: BookingImportSnapshotSchema, ...errors },
  },
  extract: {
    method: 'POST',
    path: '/trips/:tripId/booking-imports/:sourceId/extract',
    pathParams: SourceParams,
    body: BookingExtractInputSchema,
    responses: { 200: BookingExtractionAttemptSchema, ...errors },
  },
  review: {
    method: 'POST',
    path: '/trips/:tripId/booking-imports/:sourceId/review',
    pathParams: SourceParams,
    body: BookingReviewInputSchema,
    responses: { 200: z.strictObject({ decisions: z.array(BookingDecisionSchema) }), ...errors },
  },
  commit: {
    method: 'POST',
    path: '/trips/:tripId/booking-imports/:sourceId/commit',
    pathParams: SourceParams,
    body: BookingCommitInputSchema,
    responses: { 200: BookingCommitResultSchema, ...errors },
  },
});
/** Exact typed bind request. */
export type BookingBindInput = z.infer<typeof BookingBindInputSchema>;
/** Exact one-shot extraction request. */
export type BookingExtractInput = z.infer<typeof BookingExtractInputSchema>;
/** Explicit current-revision reviewed batch. */
export type BookingReviewInput = z.infer<typeof BookingReviewInputSchema>;
/** Explicit atomic commit batch. */
export type BookingCommitInput = z.infer<typeof BookingCommitInputSchema>;
/** Producer-issued verified source identity. */
export type BookingImportSource = z.infer<typeof BookingImportSourceSchema>;
/** Immutable source-selection proof. */
export type BookingSourceBinding = z.infer<typeof BookingSourceBindingSchema>;
/** Persisted one-shot attempt and noncanonical outcome. */
export type BookingExtractionAttempt = z.infer<typeof BookingExtractionAttemptSchema>;
/** Durable source, binding, attempt and decision history with current canonical operation results. */
export type BookingImportSnapshot = z.infer<typeof BookingImportSnapshotSchema>;
