/**
 * Reconciliation surface — `reconcile.*` sub-router.
 *
 * The queue the review UI renders, the decisions a human can make about a
 * link, and an explicit sweep trigger.
 *
 * **`reject` and `unlink` are not the same decision** and both are kept.
 * `unlink` removes a link and remembers nothing, so the next sweep is free
 * to re-derive it — the right answer for a pin made in error. `reject`
 * records the pairing as ruled out, which the solver's blocking stage
 * consults, so it survives every later sweep.
 *
 * `confirm` writes the other half: a `purchase_match_rules` row keyed on
 * the descriptor the accepted transaction carried, scoped to the order's
 * source. That is why its response names a rule id rather than a bare
 * acknowledgement — a caller can tell a decision that taught the matcher
 * something from one that could not.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema, OkSchema, QueryBoolSchema } from './rest-schemas.js';
import {
  CentsSchema,
  CurrencySchema,
  IsoTimestampSchema,
  LinkTypeSchema,
  PopsUriSchema,
} from './schemas/purchase.js';

const c = initContract();

/** Mirrors `PurchaseChargeLinkSchema` field-for-field where they overlap. */
export const QueuedLinkSchema = z.object({
  transactionUri: PopsUriSchema,
  /**
   * The transaction's descriptor as the sweep read it, which is what a
   * confirm turns into a match rule. Null only for a link proposed before
   * the pillar recorded descriptors.
   */
  transactionDescription: z.string().nullable(),
  amountCents: CentsSchema,
  linkType: LinkTypeSchema,
  confidence: z.number().min(0).max(1),
});

export const QueueEntrySchema = z.object({
  chargeId: z.string(),
  purchaseId: z.string(),
  source: z.string(),
  sourceOrderId: z.string().nullable(),
  merchantEntityName: z.string().nullable(),
  orderedAt: IsoTimestampSchema,
  currency: CurrencySchema,
  amountCents: CentsSchema,
  /** Empty means unexplained rather than contested — a different UI state. */
  proposed: z.array(QueuedLinkSchema),
  /**
   * `Σ proposed − charge`. Zero for a clean match, negative for a partial
   * payment, and positive only when a charge is over-linked, which is a bug
   * worth surfacing rather than clamping away.
   */
  deltaCents: CentsSchema,
});

export const ReconcileQueueQuerySchema = z.object({
  source: z.string().optional(),
  kind: z.enum(['proposed', 'unexplained']).optional(),
  /**
   * Include sources set to auto-link. Off by default: grocery is ~6,000
   * line items a year from one merchant, and a queue that asks about every
   * one of them gets abandoned along with the orders that do need a
   * decision (ADR-042).
   */
  includeAuto: QueryBoolSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const LinkDecisionBodySchema = z.object({
  chargeId: z.string().trim().min(1),
  transactionUri: PopsUriSchema,
});

/**
 * What a confirm did beyond pinning.
 *
 * Null `matchRuleId` is a normal outcome, not a failure: the transaction's
 * descriptor may carry no pattern a rule could key on, and a link proposed
 * before descriptors were recorded carries none at all. The pin stands
 * either way, and saying so is what stops a caller reporting a successful
 * decision as a broken one.
 */
export const ConfirmResultSchema = z.object({
  ok: z.literal(true),
  matchRuleId: z.string().nullable(),
});

export const SweepOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('swept'),
    chargesConsidered: z.int(),
    derivedChargesMinted: z.int(),
    linksTornDown: z.int(),
    linksWritten: z.int(),
    reviewCount: z.int(),
  }),
  /** Finance could not be asked, so nothing was written. Not an error. */
  z.object({ kind: z.literal('skipped'), reason: z.string() }),
]);

export const purchasesReconcileContract = c.router({
  queue: {
    method: 'GET',
    path: '/reconcile/queue',
    query: ReconcileQueueQuerySchema,
    responses: { 200: z.object({ items: z.array(QueueEntrySchema) }) },
    summary: 'Charges awaiting a decision, newest order first',
  },
  confirm: {
    method: 'POST',
    path: '/reconcile/confirm',
    body: LinkDecisionBodySchema,
    responses: { 200: ConfirmResultSchema, 404: ErrorBodySchema },
    summary: 'Pin a link and learn the merchant descriptor behind it',
  },
  unlink: {
    method: 'POST',
    path: '/reconcile/unlink',
    body: LinkDecisionBodySchema,
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Remove a link without recording a decision. A later sweep may re-derive it',
  },
  reject: {
    method: 'POST',
    path: '/reconcile/reject',
    body: LinkDecisionBodySchema,
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Rule a pairing out for good, so no later sweep proposes it again',
  },
  sweep: {
    method: 'POST',
    path: '/reconcile/sweep',
    body: z.object({ source: z.string().optional() }).optional(),
    responses: { 200: SweepOutcomeSchema, 503: ErrorBodySchema },
    summary: 'Run a reconciliation sweep now',
  },
});
