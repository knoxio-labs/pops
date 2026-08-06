/**
 * Reconciliation surface — `reconcile.*` sub-router.
 *
 * The queue the review UI renders (POPS-241), plus the two decisions a
 * human can make about a link and an explicit sweep trigger.
 *
 * **There is no `reject`.** Rejecting a proposal so that it *stays*
 * rejected needs somewhere to remember the decision, and that is
 * `purchase_match_rules` (POPS-1309). Without it, a reject would delete a
 * link that the very next sweep re-derives — a button that appears to work
 * and silently undoes itself, which is worse than its absence. `unlink`
 * exists and is honest about being temporary.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema, OkSchema } from './rest-schemas.js';
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
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const LinkDecisionBodySchema = z.object({
  chargeId: z.string().trim().min(1),
  transactionUri: PopsUriSchema,
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
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Pin a link so re-derivation never revises it',
  },
  unlink: {
    method: 'POST',
    path: '/reconcile/unlink',
    body: LinkDecisionBodySchema,
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Remove a link. The next sweep may re-derive it — see POPS-1309',
  },
  sweep: {
    method: 'POST',
    path: '/reconcile/sweep',
    body: z.object({ source: z.string().optional() }).optional(),
    responses: { 200: SweepOutcomeSchema, 503: ErrorBodySchema },
    summary: 'Run a reconciliation sweep now',
  },
});
