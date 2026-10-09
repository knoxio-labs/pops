/**
 * The reconcile queue: what still wants a human decision.
 *
 * The queue combines persisted link state with the latest successful sweep's
 * review evidence. A sweep replaces that evidence only for charges it
 * reconsidered, so a scoped run cannot erase another charge's candidates.
 * Two facts in the database decide whether a charge is awaiting a decision:
 *
 * - a link with `confirmed_at IS NULL` is a proposal awaiting a decision
 * - a charge with no link at all is unexplained
 *
 * The sweep re-derives link state and replaces review evidence for the
 * charges it considered only after Finance reads succeed. A skipped sweep
 * therefore leaves the last successful review snapshot available.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import {
  purchaseChargeLinks,
  purchaseCharges,
  purchaseChargeReviews,
  purchaseMatchRules,
  purchases,
  purchaseSources,
} from '../schema.js';

import type { SQL } from 'drizzle-orm';

import type { LinkType } from '../../contract/constants.js';
import type { ReviewReason } from '../../reconcile/types.js';
import type { PurchasesDb } from './internal.js';

export interface QueuedLink {
  readonly transactionUri: string;
  /**
   * The transaction's descriptor as the sweep read it. Null only for a link
   * written before the column existed.
   *
   * It is what a confirm turns into a match rule, so showing it is showing
   * the reader the thing their decision is actually about — not decoration.
   */
  readonly transactionDescription: string | null;
  readonly amountCents: number;
  readonly linkType: LinkType;
  readonly confidence: number;
  readonly matchRuleId: string | null;
  readonly matchRulePattern: string | null;
  readonly matchRuleSource: string | null;
  readonly matchRuleIsActive: boolean | null;
}

export interface QueueEntry {
  readonly chargeId: string;
  readonly purchaseId: string;
  readonly source: string;
  readonly sourceOrderId: string | null;
  readonly merchantEntityName: string | null;
  readonly orderedAt: string;
  readonly currency: string;
  /** The charge's own amount, which is what a decision is about. */
  readonly amountCents: number;
  /**
   * What the engine proposes. Empty means nothing was found — the charge is
   * unexplained rather than contested, and the two want different
   * treatment in the UI.
   */
  readonly proposed: readonly QueuedLink[];
  /** Why the last successful sweep left this charge for a person to decide. */
  readonly reviewReason: ReviewReason | null;
  /** Finance transaction URIs admitted by the stage that asked for review. */
  readonly reviewCandidateUris: readonly string[];
  /** `Σ proposed − charge`. Zero for a clean match, non-zero for a partial. */
  readonly deltaCents: number;
}

export interface QueueFilter {
  readonly source?: string;
  /** Only charges with at least one proposal, or only those with none. */
  readonly kind?: 'proposed' | 'unexplained';
  /**
   * Include sources whose `autoLinkPolicy` is `auto`.
   *
   * Off by default, which is the whole point of the column. A weekly
   * grocery shop is ~60 line items and ~6,000 a year from one merchant; if
   * every one of those charges asked a question the queue becomes
   * unusable and gets abandoned, taking the orders that DO need a decision
   * with it (ADR-042).
   *
   * On means "show me the low-priority bucket too" — the merchant lens
   * wants it, the daily queue does not.
   */
  readonly includeAuto?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * One row per charge awaiting a decision, newest order first.
 *
 * Cash and ignored orders are excluded for the same reason the sweep skips
 * them: no transaction will ever exist, so a permanently undecidable row
 * appearing every day is the false alarm that trains someone to stop
 * reading the queue.
 */
export function listReconcileQueue(db: PurchasesDb, filter: QueueFilter = {}): QueueEntry[] {
  const entries: QueueEntry[] = [];

  for (const row of undecidedCharges(db, filter)) {
    const proposed = proposalsFor(db, row.chargeId);
    const linked = proposed.reduce((sum, link) => sum + link.amountCents, 0);
    entries.push({
      chargeId: row.chargeId,
      purchaseId: row.purchaseId,
      source: row.source,
      sourceOrderId: row.sourceOrderId,
      merchantEntityName: row.merchantEntityName,
      orderedAt: row.orderedAt,
      currency: row.currency,
      amountCents: row.amountCents,
      proposed,
      reviewReason: row.reviewReason,
      reviewCandidateUris: row.reviewCandidateUris ?? [],
      // Signed on purpose: an over-linked charge is a bug, and clamping it
      // to zero would hide the only evidence that it happened.
      deltaCents: linked - row.amountCents,
    });
  }

  return entries;
}

interface UndecidedCharge {
  chargeId: string;
  purchaseId: string;
  source: string;
  sourceOrderId: string | null;
  merchantEntityName: string | null;
  orderedAt: string;
  currency: string;
  amountCents: number;
  position: number;
  reviewReason: ReviewReason | null;
  reviewCandidateUris: string[] | null;
}

/**
 * The predicate `undecidedCharges` filters on, narrowed by `kind`.
 *
 * A charge is undecided when it has an unconfirmed link, or no link at all.
 * `kind` narrows to one side of that OR: `proposed` is exactly "has an
 * unconfirmed link", and `unexplained` is exactly "has no link at all" — the
 * two undecided branches are mutually exclusive, so ANDing the undecided OR
 * with either branch collapses it to that branch alone. The OUTER
 * PARENTHESES on the unfiltered form are load-bearing: `AND` binds tighter
 * than `OR`, so without them this reads as `(everything AND EXISTS…) OR (NOT
 * EXISTS…)` and every chargeless row matches regardless of the other filters
 * ANDed alongside it.
 */
function undecidedKindPredicate(kind: QueueFilter['kind']): SQL {
  if (kind === 'proposed') {
    return sql`EXISTS (
      SELECT 1 FROM purchase_charge_links l
      WHERE l.charge_id = ${purchaseCharges.id} AND l.confirmed_at IS NULL
    )`;
  }
  if (kind === 'unexplained') {
    return sql`NOT EXISTS (
      SELECT 1 FROM purchase_charge_links l WHERE l.charge_id = ${purchaseCharges.id}
    )`;
  }
  return sql`(
    EXISTS (
      SELECT 1 FROM purchase_charge_links l
      WHERE l.charge_id = ${purchaseCharges.id} AND l.confirmed_at IS NULL
    )
    OR NOT EXISTS (
      SELECT 1 FROM purchase_charge_links l WHERE l.charge_id = ${purchaseCharges.id}
    )
  )`;
}

/** Charges with an unconfirmed link, or with no link at all. */
function undecidedCharges(db: PurchasesDb, filter: QueueFilter): UndecidedCharge[] {
  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(filter.offset ?? 0, 0);

  return db
    .select({
      chargeId: purchaseCharges.id,
      purchaseId: purchases.id,
      source: purchases.source,
      sourceOrderId: purchases.sourceOrderId,
      merchantEntityName: purchases.merchantEntityName,
      orderedAt: purchases.orderedAt,
      currency: purchases.currency,
      amountCents: purchaseCharges.amountCents,
      position: purchaseCharges.position,
      reviewReason: purchaseChargeReviews.reason,
      reviewCandidateUris: purchaseChargeReviews.candidateUris,
    })
    .from(purchaseCharges)
    .innerJoin(purchases, eq(purchaseCharges.purchaseId, purchases.id))
    .leftJoin(purchaseSources, eq(purchases.source, purchaseSources.id))
    .leftJoin(purchaseChargeReviews, eq(purchaseChargeReviews.chargeId, purchaseCharges.id))
    .where(
      and(
        sql`${purchases.settlementMode} <> 'cash'`,
        sql`${purchases.status} <> 'ignored'`,
        // A source with no row at all is treated as `review`: an
        // unregistered merchant is the one most likely to need looking at,
        // so silence would be exactly the wrong default.
        filter.includeAuto === true
          ? undefined
          : sql`(${purchaseSources.autoLinkPolicy} IS NULL OR ${purchaseSources.autoLinkPolicy} <> 'auto')`,
        filter.source === undefined ? undefined : eq(purchases.source, filter.source),
        undecidedKindPredicate(filter.kind)
      )
    )
    .orderBy(
      sql`${purchases.orderedAt} DESC`,
      asc(purchaseCharges.position),
      asc(purchaseCharges.id)
    )
    .limit(limit)
    .offset(offset)
    .all();
}

/** The unconfirmed links on one charge — what the engine currently proposes. */
function proposalsFor(db: PurchasesDb, chargeId: string): QueuedLink[] {
  return db
    .select({
      transactionUri: purchaseChargeLinks.transactionUri,
      transactionDescription: purchaseChargeLinks.transactionDescription,
      amountCents: purchaseChargeLinks.amountCents,
      linkType: purchaseChargeLinks.linkType,
      confidence: purchaseChargeLinks.confidence,
      matchRuleId: purchaseChargeLinks.matchRuleId,
      matchRulePattern: purchaseMatchRules.descriptionPattern,
      matchRuleSource: purchaseMatchRules.source,
      matchRuleIsActive: purchaseMatchRules.isActive,
    })
    .from(purchaseChargeLinks)
    .leftJoin(purchaseMatchRules, eq(purchaseChargeLinks.matchRuleId, purchaseMatchRules.id))
    .where(and(eq(purchaseChargeLinks.chargeId, chargeId), isNull(purchaseChargeLinks.confirmedAt)))
    .orderBy(asc(purchaseChargeLinks.transactionUri))
    .all();
}
