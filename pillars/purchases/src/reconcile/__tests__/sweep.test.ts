/**
 * The sweep against a real database.
 *
 * These use real in-memory SQLite and the real service layer — the solver
 * unit tests prove the arithmetic, and these prove the arithmetic is
 * actually reached, persisted, and safely re-run. Only the finance
 * transport is a fake, and `finance-http.test.ts` covers that over real
 * HTTP.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { confirmLink, createPurchase, listConfirmedLinks } from '../../db/index.js';
import { runSweep } from '../sweep.js';

import type { CandidateFetch, FinanceClient } from '../../api/finance/client.js';
import type { OpenedPurchasesDb } from '../../db/index.js';
import type { PurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let db: PurchasesDb;

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  db = opened.db;
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

function financeReturning(...transactions: { uri: string; amountCents: number; date: string }[]) {
  return {
    fetchCandidates: () =>
      Promise.resolve<CandidateFetch>({
        kind: 'ok',
        transactions: transactions.map((t) => ({
          uri: t.uri,
          description: 'AMAZON MKTPLACE AU',
          amountCents: t.amountCents,
          date: t.date,
        })),
      }),
  } satisfies FinanceClient;
}

const UNAVAILABLE: FinanceClient = {
  fetchCandidates: () =>
    Promise.resolve<CandidateFetch>({ kind: 'unavailable', reason: 'unavailable' }),
};

function anAmazonOrder(totalCents: number, checksum: string) {
  return createPurchase(db, {
    source: 'amazon',
    sourceOrderId: checksum,
    ingestMethod: 'export',
    orderedAt: '2026-03-04T00:00:00Z',
    currency: 'AUD',
    totalCents,
    checksum,
  });
}

const deps = (finance: FinanceClient) => ({ db, finance, defaultWindowDays: 21 });

/** Link rows as they actually exist, so assertions check state not counters. */
function linkRows(): { chargeId: string; uri: string; confirmedAt: string | null }[] {
  return opened.raw
    .prepare(
      'SELECT charge_id as chargeId, transaction_uri as uri, confirmed_at as confirmedAt ' +
        'FROM purchase_charge_links ORDER BY transaction_uri'
    )
    .all() as { chargeId: string; uri: string; confirmedAt: string | null }[];
}

describe('derived charges', () => {
  it('mints one for an order whose source states no charge', async () => {
    // Every Amazon order is this case: the export publishes no charge
    // breakdown, so without minting the whole backfill is invisible.
    anAmazonOrder(4128, 'a');

    const result = await runSweep(deps(financeReturning()));

    expect(result.kind).toBe('swept');
    if (result.kind !== 'swept') return;
    expect(result.derivedChargesMinted).toBe(1);
  });

  it('does not mint a second one on the next sweep', async () => {
    anAmazonOrder(4128, 'a');
    await runSweep(deps(financeReturning()));

    const second = await runSweep(deps(financeReturning()));
    expect(second.kind).toBe('swept');
    if (second.kind !== 'swept') return;
    expect(second.derivedChargesMinted).toBe(0);
  });

  it('matches the order it minted a charge for, in the same sweep', async () => {
    anAmazonOrder(4128, 'a');

    const result = await runSweep(
      deps(
        financeReturning({
          uri: 'pops://finance/transaction/t1',
          amountCents: 4128,
          date: '2026-03-06',
        })
      )
    );

    expect(result.kind).toBe('swept');
    if (result.kind !== 'swept') return;
    expect(result.linksWritten).toBe(1);
  });
});

describe('an unreachable finance', () => {
  it('skips the sweep instead of tearing anything down', async () => {
    // THE test this slice exists for. Teardown plus a re-solve against an
    // empty candidate set would unlink every correctly matched order in the
    // window and report the money as unexplained.
    anAmazonOrder(4128, 'a');
    await runSweep(
      deps(
        financeReturning({
          uri: 'pops://finance/transaction/t1',
          amountCents: 4128,
          date: '2026-03-06',
        })
      )
    );

    expect(linkRows()).toHaveLength(1);

    const skipped = await runSweep(deps(UNAVAILABLE));
    expect(skipped.kind).toBe('skipped');

    // The row itself must survive, not merely a counter reading zero.
    expect(linkRows()).toEqual([
      { chargeId: expect.any(String), uri: 'pops://finance/transaction/t1', confirmedAt: null },
    ]);
  });

  it('mints no derived charge either, so nothing the user sees changes', async () => {
    // Not a technicality. A derived charge moves an order's money out of
    // residual and into awaitingImport, so minting during an outage would
    // change the explained/unexplained split while reporting that the sweep
    // did nothing.
    anAmazonOrder(4128, 'a');

    const result = await runSweep(deps(UNAVAILABLE));
    expect(result.kind).toBe('skipped');

    const charges = opened.raw.prepare('SELECT COUNT(*) as n FROM purchase_charges').get() as {
      n: number;
    };
    expect(charges.n).toBe(0);
  });

  it('reports why it skipped', async () => {
    anAmazonOrder(4128, 'a');
    const result = await runSweep(deps(UNAVAILABLE));
    expect(result.kind).toBe('skipped');
    if (result.kind !== 'skipped') return;
    expect(result.reason).toBe('unavailable');
  });
});

describe('idempotency', () => {
  it('reaches the same state when run twice over unchanged data', async () => {
    anAmazonOrder(4128, 'a');
    const finance = financeReturning({
      uri: 'pops://finance/transaction/t1',
      amountCents: 4128,
      date: '2026-03-06',
    });

    const first = await runSweep(deps(finance));
    const second = await runSweep(deps(finance));

    expect(first.kind).toBe('swept');
    expect(second.kind).toBe('swept');
    if (first.kind !== 'swept' || second.kind !== 'swept') return;
    // The second sweep tears its own link down and writes it back — the
    // same end state, which is what makes a timer safe.
    expect(second.linksWritten).toBe(first.linksWritten);
    expect(second.review).toEqual(first.review);
    expect(linkRows()).toEqual([
      { chargeId: expect.any(String), uri: 'pops://finance/transaction/t1', confirmedAt: null },
    ]);
  });
});

describe('cash orders', () => {
  it('never enters the sweep, because no transaction will ever exist', async () => {
    createPurchase(db, {
      source: 'amazon',
      sourceOrderId: 'cash-1',
      ingestMethod: 'manual',
      orderedAt: '2026-03-04T00:00:00Z',
      currency: 'AUD',
      totalCents: 999,
      settlementMode: 'cash',
      checksum: 'cash-1',
    });

    const result = await runSweep(deps(financeReturning()));
    expect(result.kind).toBe('swept');
    if (result.kind !== 'swept') return;
    // A cash order in the queue is a permanently unmatchable row that shows
    // up every night — the false alarm that trains someone to ignore it.
    expect(result.derivedChargesMinted).toBe(0);
    expect(result.chargesConsidered).toBe(0);
    expect(result.review).toHaveLength(0);
  });
});

describe('a corrupt order date', () => {
  it('yields no window and sweeps nothing, rather than throwing', () => {
    // Written straight to SQLite to bypass the contract's validation, which
    // is the only way this state arises — a hand-edited row or a migration
    // from a source that never validated. The sweep must survive it.
    anAmazonOrder(4128, 'a');
    opened.raw.prepare("UPDATE purchases SET ordered_at = 'not-a-date'").run();

    return expect(runSweep(deps(financeReturning()))).resolves.toMatchObject({
      kind: 'swept',
      linksWritten: 0,
    });
  });
});

describe('confirmed links are never torn down', () => {
  it('survives a sweep that would otherwise re-derive them', async () => {
    anAmazonOrder(4128, 'a');
    const finance = financeReturning({
      uri: 'pops://finance/transaction/t1',
      amountCents: 4128,
      date: '2026-03-06',
    });
    await runSweep(deps(finance));

    // Confirm whatever the sweep proposed.
    const links = opened.raw
      .prepare('SELECT charge_id as chargeId, transaction_uri as uri FROM purchase_charge_links')
      .all() as { chargeId: string; uri: string }[];
    expect(links).toHaveLength(1);
    const [link] = links;
    if (link === undefined) throw new Error('expected a link to confirm');
    confirmLink(db, link.chargeId, link.uri, '2026-03-10T00:00:00Z');
    expect(listConfirmedLinks(db)).toHaveLength(1);

    // A sweep where the transaction has vanished from finance entirely.
    const after = await runSweep(deps(financeReturning()));
    expect(after.kind).toBe('swept');
    if (after.kind !== 'swept') return;
    expect(after.linksTornDown).toBe(0);
    // Still present, still confirmed — a pinned decision outlives the
    // evidence that produced it.
    expect(linkRows()).toEqual([
      {
        chargeId: expect.any(String),
        uri: 'pops://finance/transaction/t1',
        confirmedAt: '2026-03-10T00:00:00Z',
      },
    ]);
    expect(listConfirmedLinks(db)).toHaveLength(1);
  });
});
