/**
 * The sweep: load a snapshot, re-solve it, write the result.
 *
 * One idempotent path, shared by all three triggers (purchase ingest,
 * transaction commit, nightly cron). Running it twice over unchanged data
 * must change nothing the second time — that is what makes it safe to fire
 * from a timer and from an ingest hook at once.
 */
import {
  listConfirmedLinks,
  listOrdersNeedingDerivedCharge,
  listSolvableCharges,
  mintDerivedCharge,
  persistProposedLinks,
  tearDownUnconfirmedLinks,
  type ReconcileScope,
} from '../db/index.js';
import { solve } from './solve.js';
import { settlementWindowFor, unionOfWindows } from './window.js';

import type { FinanceClient } from '../api/finance/client.js';
import type { PurchasesDb } from '../db/index.js';
import type { ChargeForReview, SolvableCharge } from './types.js';

export interface SweepResult {
  readonly kind: 'swept';
  readonly chargesConsidered: number;
  readonly derivedChargesMinted: number;
  readonly linksTornDown: number;
  readonly linksWritten: number;
  readonly review: readonly ChargeForReview[];
}

export type SweepOutcome =
  | SweepResult
  /**
   * Nothing was read, so nothing was written. Distinct from a sweep that
   * found no work — see {@link runSweep}.
   */
  | { readonly kind: 'skipped'; readonly reason: string };

export interface SweepDeps {
  readonly db: PurchasesDb;
  readonly finance: FinanceClient;
  readonly defaultWindowDays: number;
}

/**
 * Run one sweep over `scope`.
 *
 * **An unreachable finance skips the sweep entirely.** The teardown and the
 * re-solve are one operation: tearing down links and then re-solving
 * against an empty candidate set would unlink every correctly matched order
 * in the window and report the money as unexplained. So the candidates are
 * fetched FIRST, and a non-`ok` fetch returns before anything is written.
 * This is the constraint the finance client's discriminated result exists
 * to make unmissable.
 */
export async function runSweep(deps: SweepDeps, scope: ReconcileScope = {}): Promise<SweepOutcome> {
  const { db, finance, defaultWindowDays } = deps;

  const minted = mintMissingCharges(db, scope);
  const charges = listSolvableCharges(db, scope);
  if (charges.length === 0) {
    return emptySweep(minted);
  }

  const window = unionOfWindows(
    charges.flatMap((charge) => {
      const each = settlementWindowFor(
        charge.orderedAt,
        charge.settlementWindowDays ?? defaultWindowDays
      );
      return each === null ? [] : [each];
    })
  );
  if (window === null) return emptySweep(minted);

  const fetched = await finance.fetchCandidates(window);
  if (fetched.kind !== 'ok') {
    return { kind: 'skipped', reason: fetched.reason };
  }

  const confirmed = listConfirmedLinks(db);
  const solved = solve({
    charges,
    transactions: fetched.transactions,
    confirmed,
    defaultWindowDays,
  });

  // Teardown and write are one transaction: a sweep that discarded links
  // and then failed would leave every order in the window looking unpaid.
  let tornDown = 0;
  let written = 0;
  db.transaction((tx) => {
    tornDown = tearDownUnconfirmedLinks(tx, unconfirmedChargeIds(charges, confirmed));
    written = persistProposedLinks(tx, solved.links);
  });

  return {
    kind: 'swept',
    chargesConsidered: charges.length,
    derivedChargesMinted: minted,
    linksTornDown: tornDown,
    linksWritten: written,
    review: solved.review,
  };
}

/**
 * Give every chargeless order a `derived` charge before the snapshot is
 * read, so the same sweep can match it. Amazon states no charges at all, so
 * without this its whole backlog is invisible to the solver.
 */
function mintMissingCharges(db: PurchasesDb, scope: ReconcileScope): number {
  const orders = listOrdersNeedingDerivedCharge(db, scope);
  if (orders.length === 0) return 0;

  db.transaction((tx) => {
    for (const order of orders) mintDerivedCharge(tx, order);
  });
  return orders.length;
}

/**
 * Charges whose links may be discarded — everything except those a human
 * has pinned. Passing a confirmed charge to the teardown would be harmless
 * (the predicate filters on `confirmedAt`) but excluding them here keeps
 * the delete's scope honest about what it is allowed to touch.
 */
function unconfirmedChargeIds(
  charges: readonly SolvableCharge[],
  confirmed: readonly { chargeId: string }[]
): string[] {
  const pinned = new Set(confirmed.map((link) => link.chargeId));
  return charges.filter((charge) => !pinned.has(charge.id)).map((charge) => charge.id);
}

function emptySweep(minted: number): SweepResult {
  return {
    kind: 'swept',
    chargesConsidered: 0,
    derivedChargesMinted: minted,
    linksTornDown: 0,
    linksWritten: 0,
    review: [],
  };
}

/** Re-export so callers scope a sweep without reaching into the db layer. */
export type { ReconcileScope };
