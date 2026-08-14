/**
 * Live finance-pillar client for the purchases backend.
 *
 * The reconciliation ladder (POPS-237) matches charges against transactions
 * finance owns. This pillar keeps no mirror: candidates are fetched per
 * sweep, over a date window, and joined in memory for that run only.
 *
 * Follows `pillars/finance/src/api/contacts/client.ts` — the SDK proxy with
 * a hand-written narrow router type, injectable for tests, no npm
 * dependency on the producer. It departs from that template in exactly one
 * way, and the departure is the point: see {@link CandidateFetch}.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialled,
  credentialRejectedMessage,
  NO_CREDENTIAL_REASON,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';
import {
  FinanceListResponseSchema,
  toCandidateTransaction,
  type CandidateTransaction,
} from './wire.js';

/** The finance pillar id, as registered with the registry. */
export const FINANCE_PILLAR_ID = 'finance';

/**
 * Per-page size. Finance caps `limit` at 500 and rejects more, so this is
 * the producer's ceiling rather than a preference.
 */
const PAGE_SIZE = 500;

/**
 * Backstop against a runaway loop on a misbehaving peer, not a dataset cap.
 * At `PAGE_SIZE` this is 50,000 transactions in one window — far above any
 * 14–21 day settlement window, so reaching it means something is wrong, and
 * it is reported as a failure rather than a short read.
 */
const MAX_PAGES = 100;

/**
 * Typed handle over the subset of the finance router this pillar calls.
 * Declared as a `type` (not `interface`) so it satisfies the SDK proxy's
 * `Record<string, unknown>` constraint. Exported for tests that drive
 * {@link createFinanceClient} against a stub.
 */
export type FinanceRouter = {
  transactions: {
    list: (input: {
      search?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    }) => Promise<unknown>;
  };
};

/**
 * The result of asking finance for candidates.
 *
 * **This is deliberately not an array.** The contacts client this is
 * modelled on substitutes an empty set when its producer is down, which is
 * right for name matching — a no-match run is harmless. Here it would be
 * catastrophic: auto-links are re-derived by tearing down every unconfirmed
 * link in a window and re-solving from what is found (ADR-042), so an
 * outage that reads as "no transactions exist" would unlink correctly
 * matched orders fleet-wide and report the money as unexplained.
 *
 * "Finance is unreachable" and "the window is genuinely empty" must
 * therefore be different values, not the same empty array. A sweep that
 * receives `unavailable` must do nothing at all and try again later.
 *
 * `reason` is where the *why* lives, and a credential problem is named
 * there rather than folded in: `unauthorized` and `no-credential` mean the
 * sweep will keep writing nothing until an operator acts, which is not
 * something waiting fixes.
 */
export type CandidateFetch =
  | { readonly kind: 'ok'; readonly transactions: readonly CandidateTransaction[] }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** The date window and optional descriptor blocking for one sweep. */
export interface CandidateQuery {
  /** Inclusive `YYYY-MM-DD` lower bound on transaction date. */
  readonly startDate: string;
  /** Inclusive `YYYY-MM-DD` upper bound on transaction date. */
  readonly endDate: string;
  /**
   * Descriptor filter, from `purchase_sources.descriptorPattern` — stage 0
   * blocking. Finance treats it as a substring search, so it narrows the
   * pull; it never decides a match on its own.
   */
  readonly search?: string;
}

/**
 * The injectable seam the reconciliation engine depends on. The default
 * impl is backed by `pillar('finance')`; tests pass a fake so the solver
 * and the degradation paths are exercised without the network.
 */
export interface FinanceClient {
  fetchCandidates(query: CandidateQuery): Promise<CandidateFetch>;
}

/**
 * How a handle is obtained per sweep. `null` means this process has no
 * service-account key, which is a configuration answer rather than a
 * transport one — see {@link credentialled}.
 */
export type FinanceHandleFactory = () => PillarHandle<FinanceRouter> | null;

/** Test-only knobs; production takes the module defaults. */
export interface FinanceClientOptions {
  /** Override the paging safety cap (default {@link MAX_PAGES}). */
  readonly maxPages?: number;
}

export function createFinanceClient(
  handleFactory: FinanceHandleFactory = () =>
    credentialled(FINANCE_PILLAR_ID, () => pillar<FinanceRouter>(FINANCE_PILLAR_ID)),
  options: FinanceClientOptions = {}
): FinanceClient {
  const maxPages = options.maxPages ?? MAX_PAGES;
  return {
    fetchCandidates(query: CandidateQuery): Promise<CandidateFetch> {
      const handle = handleFactory();
      if (handle === null) {
        return Promise.resolve({ kind: 'unavailable', reason: NO_CREDENTIAL_REASON });
      }
      return pageThroughTransactions(handle, query, maxPages);
    },
  };
}

async function pageThroughTransactions(
  handle: PillarHandle<FinanceRouter>,
  query: CandidateQuery,
  maxPages: number
): Promise<CandidateFetch> {
  const all: CandidateTransaction[] = [];

  for (let page = 0; page < maxPages; page++) {
    const result = await handle.transactions.list({
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });

    const parsed = readPage(result);
    if (parsed.kind !== 'ok') return parsed;

    all.push(...parsed.page.data.map(toCandidateTransaction));
    if (!parsed.page.pagination.hasMore) return { kind: 'ok', transactions: all };
  }

  // A partial set is worse than none: the solver would tear down links in
  // the window and re-solve against transactions it cannot see, producing
  // confident wrong answers rather than no answer.
  return {
    kind: 'unavailable',
    reason: `transactions.list exceeded the ${String(maxPages)}-page safety cap for ${query.startDate}..${query.endDate}`,
  };
}

type ReadPageResult =
  | { kind: 'ok'; page: ReturnType<typeof FinanceListResponseSchema.parse> }
  | { kind: 'unavailable'; reason: string };

/**
 * Fold one SDK call into either a validated page or a reason it cannot be
 * used. A response that does not match the schema is treated as
 * unavailable rather than thrown: the producer being wrong is a transient
 * operational fact from this side, and a sweep must skip a tick rather than
 * crash the pillar.
 */
function readPage(result: CallResult<unknown>): ReadPageResult {
  if (!isOk(result)) {
    // A refusal is reported once here rather than left to the sweep's
    // `skipped` line: that line says a window was not reconciled, and an
    // operator reading it cannot tell a finance outage from a grant that
    // never included `finance.transactions`.
    if (result.kind === UNAUTHORIZED_REASON) {
      console.error(credentialRejectedMessage(FINANCE_PILLAR_ID, 'transactions.list'));
    }
    return { kind: 'unavailable', reason: result.kind };
  }

  const parsed = FinanceListResponseSchema.safeParse(result.value);
  if (!parsed.success) {
    console.warn(
      `[finance] transactions.list returned a shape this pillar cannot read — ` +
        `treating the window as unreadable rather than empty: ${parsed.error.message}`
    );
    return { kind: 'unavailable', reason: 'contract-mismatch' };
  }

  return { kind: 'ok', page: parsed.data };
}
