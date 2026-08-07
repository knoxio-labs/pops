/**
 * The reconcile queue: what still wants a human decision.
 *
 * Derived entirely from persisted state rather than from a stored copy of
 * the solver's `review` output. A sweep re-derives everything on every run,
 * so a saved verdict would be stale the moment the next sweep disagreed
 * with it — and the queue would show reasons for links that no longer
 * exist. Two facts in the database say everything the queue needs:
 *
 * - a link with `confirmed_at IS NULL` is a proposal awaiting a decision
 * - a charge with no link at all is unexplained
 *
 * Both are re-derived by the sweep, so the queue is always a view of what
 * the engine currently believes rather than of what it once believed.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { purchaseChargeLinks, purchaseCharges, purchases, purchaseSources } from '../schema.js';

import type { LinkType } from '../../contract/constants.js';
import type { PurchasesDb } from './internal.js';

export interface QueuedLink {
  readonly transactionUri: string;
  readonly amountCents: number;
  readonly linkType: LinkType;
  readonly confidence: number;
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

    if (filter.kind === 'proposed' && proposed.length === 0) continue;
    if (filter.kind === 'unexplained' && proposed.length > 0) continue;

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
    })
    .from(purchaseCharges)
    .innerJoin(purchases, eq(purchaseCharges.purchaseId, purchases.id))
    .leftJoin(purchaseSources, eq(purchases.source, purchaseSources.id))
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
        // A charge is undecided when it has an unconfirmed link, or no link
        // at all. The OUTER PARENTHESES are load-bearing: `AND` binds
        // tighter than `OR`, so without them this reads as
        // `(everything AND EXISTS…) OR (NOT EXISTS…)` and every chargeless
        // row matches regardless of the source filter above it.
        sql`(
          EXISTS (
            SELECT 1 FROM purchase_charge_links l
            WHERE l.charge_id = ${purchaseCharges.id} AND l.confirmed_at IS NULL
          )
          OR NOT EXISTS (
            SELECT 1 FROM purchase_charge_links l WHERE l.charge_id = ${purchaseCharges.id}
          )
        )`
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
      amountCents: purchaseChargeLinks.amountCents,
      linkType: purchaseChargeLinks.linkType,
      confidence: purchaseChargeLinks.confidence,
    })
    .from(purchaseChargeLinks)
    .where(and(eq(purchaseChargeLinks.chargeId, chargeId), isNull(purchaseChargeLinks.confirmedAt)))
    .orderBy(asc(purchaseChargeLinks.transactionUri))
    .all();
}
