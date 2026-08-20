/**
 * The sweep: load a snapshot, re-solve it, write the result.
 *
 * One idempotent path, shared by all three triggers (purchase ingest,
 * transaction commit, nightly cron). Running it twice over unchanged data
 * must change nothing the second time — that is what makes it safe to fire
 * from a timer and from an ingest hook at once.
 */
import {
  listActiveMatchRules,
  listConfirmedLinks,
  listOrdersNeedingDerivedCharge,
  listRejectedPairings,
  listSolvableCharges,
  mintDerivedCharge,
  persistProposedLinks,
  tearDownUnconfirmedLinks,
  type ReconcileScope,
} from '../db/index.js';
import { solve } from './solve.js';
import { settlementWindowFor, unionOfWindows, type SettlementWindow } from './window.js';

import type { FinanceClient } from '../api/finance/client.js';
import type { PurchasesDb } from '../db/index.js';
import type { ChargeForReview, SolvableCharge } from './types.js';

export interface SweepResult {
  readonly kind: 'swept';
  readonly chargesConsidered: number;
  readonly derivedChargesMinted: number;
  readonly linksTornDown: number;
  readonly linksWritten: number;
  /**
   * How many of this sweep's proposals came from stage 4.
   *
   * The only production signal that a learned rule did anything. The rule
   * table's own `timesApplied`/`lastUsedAt` deliberately count human
   * decisions rather than sweeps — see `listActiveMatchRules` — so without
   * this a rule auto-linking money every night is indistinguishable from
   * one that has never fired. Proposals rather than rows written, because
   * an unchanged link re-proposed is still the stage doing its work.
   */
  readonly ruleLinksProposed: number;
  readonly review: readonly ChargeForReview[];
}

export type SweepOutcome =
  | SweepResult
  /**
   * Finance could not be asked, so **nothing was written** — no links, and
   * no derived charges either. Reads did happen: the window is computed
   * from local state before the fetch is attempted.
   *
   * Distinct from a `swept` result with zero counts, which means the sweep
   * ran and found no work. A caller that conflates the two would report an
   * outage as a clean, empty reconciliation.
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
 * **An unreachable finance writes nothing at all.** Everything before the
 * fetch is a read; every write happens after it, in one transaction.
 *
 * The obvious half of that is teardown: discarding links and then
 * re-solving against an empty candidate set would unlink every correctly
 * matched order in the window and report the money as unexplained. The less
 * obvious half is minting — a derived charge moves an order's money out of
 * `residual` and into `awaitingImport`, so minting during an outage would
 * change what the user sees as explained while the sweep reported that it
 * had done nothing. `skipped` means nothing changed, and it has to be true.
 */
export async function runSweep(deps: SweepDeps, scope: ReconcileScope = {}): Promise<SweepOutcome> {
  const { db, finance, defaultWindowDays } = deps;

  // Read-only until the fetch succeeds. Minting is a WRITE, and not a
  // harmless one: a derived charge moves an order's money out of `residual`
  // and into `awaitingImport`, so minting during an outage would change what
  // the user sees as explained while reporting that nothing happened.
  const needingDerived = listOrdersNeedingDerivedCharge(db, scope);
  const existing = listSolvableCharges(db, scope);
  if (needingDerived.length === 0 && existing.length === 0) return emptySweep();

  const window = unionOfWindows([
    ...windowsFor(existing, defaultWindowDays),
    ...windowsFor(needingDerived, defaultWindowDays),
  ]);
  if (window === null) return emptySweep();

  const fetched = await finance.fetchCandidates(window);
  if (fetched.kind !== 'ok') {
    return { kind: 'skipped', reason: fetched.reason };
  }

  const confirmed = listConfirmedLinks(db);

  // One transaction for every write the sweep makes. Minting reads its own
  // work list inside it, so two concurrent sweeps cannot both see the same
  // order as needing one and mint a twin. Teardown and persist share it for a
  // different reason: a sweep that discarded links and then failed would
  // leave every order in its window looking unpaid.
  let result: SweepResult | null = null;
  db.transaction((tx) => {
    const minted = mintMissingCharges(tx, scope);
    const charges = listSolvableCharges(tx, scope);
    const solved = solve({
      charges,
      transactions: fetched.transactions,
      confirmed,
      rejected: listRejectedPairings(
        tx,
        charges.map((charge) => charge.id)
      ),
      rules: listActiveMatchRules(tx),
      defaultWindowDays,
    });

    result = {
      kind: 'swept',
      chargesConsidered: charges.length,
      derivedChargesMinted: minted,
      linksTornDown: tearDownUnconfirmedLinks(tx, unconfirmedChargeIds(charges, confirmed)),
      linksWritten: persistProposedLinks(tx, solved.links),
      ruleLinksProposed: solved.links.filter((link) => link.linkType === 'rule').length,
      review: solved.review,
    };
  });

  return result ?? emptySweep();
}

/** The settlement window each row contributes to the candidate fetch. */
function windowsFor(
  rows: readonly { orderedAt: string; settlementWindowDays?: number | null }[],
  defaultWindowDays: number
): SettlementWindow[] {
  return rows.flatMap((row) => {
    const each = settlementWindowFor(row.orderedAt, row.settlementWindowDays ?? defaultWindowDays);
    return each === null ? [] : [each];
  });
}

/**
 * Give every order that states no payment a `derived` charge, so the same
 * sweep can match it. Amazon states none at all beyond its refunds, so
 * without this its whole backlog is invisible to the solver.
 *
 * The work list is re-read here rather than passed in, and the caller runs
 * this inside its transaction: reading outside it would let two concurrent
 * sweeps both observe the same order as needing one and mint a twin.
 */
function mintMissingCharges(db: PurchasesDb, scope: ReconcileScope): number {
  const orders = listOrdersNeedingDerivedCharge(db, scope);
  for (const order of orders) mintDerivedCharge(db, order);
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

function emptySweep(): SweepResult {
  return {
    kind: 'swept',
    chargesConsidered: 0,
    derivedChargesMinted: 0,
    linksTornDown: 0,
    linksWritten: 0,
    ruleLinksProposed: 0,
    review: [],
  };
}

/** Re-export so callers scope a sweep without reaching into the db layer. */
export type { ReconcileScope };
