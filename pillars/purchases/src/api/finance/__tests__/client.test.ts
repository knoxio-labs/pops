import { describe, expect, it, vi } from 'vitest';

import { createFinanceClient, type FinanceRouter } from '../client.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/client';

interface WireRow {
  id: string;
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  entityId: string | null;
  entityName: string | null;
}

function row(overrides: Partial<WireRow> = {}): WireRow {
  return {
    id: 'txn-1',
    description: 'AMAZON MKTPLACE AU',
    account: 'everyday',
    amount: 41.28,
    date: '2026-03-04',
    type: 'purchase',
    entityId: null,
    entityName: null,
    ...overrides,
  };
}

function page(rows: WireRow[], hasMore = false, offset = 0): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      data: rows,
      pagination: { total: rows.length, limit: 500, offset, hasMore },
    },
  };
}

/** A stub handle returning the given results in order, recording its inputs. */
function stubHandle(results: CallResult<unknown>[]): {
  handle: PillarHandle<FinanceRouter>;
  calls: Record<string, unknown>[];
} {
  const calls: Record<string, unknown>[] = [];
  let index = 0;
  const handle = {
    transactions: {
      list: (input: Record<string, unknown>) => {
        calls.push(input);
        const result = results[Math.min(index, results.length - 1)];
        index += 1;
        return Promise.resolve(result);
      },
    },
  } as unknown as PillarHandle<FinanceRouter>;
  return { handle, calls };
}

const WINDOW = { startDate: '2026-03-01', endDate: '2026-03-22' };

describe('fetchCandidates', () => {
  it('returns candidates in integer cents', async () => {
    const { handle } = stubHandle([page([row({ amount: 19.99 })])]);
    const result = await createFinanceClient(() => handle).fetchCandidates(WINDOW);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.transactions[0]?.amountCents).toBe(1999);
    expect(result.transactions[0]?.uri).toBe('pops://finance/transaction/txn-1');
  });

  it('passes the window and descriptor through as finance query params', async () => {
    const { handle, calls } = stubHandle([page([])]);
    await createFinanceClient(() => handle).fetchCandidates({ ...WINDOW, search: 'AMAZON' });

    expect(calls[0]).toMatchObject({
      startDate: '2026-03-01',
      endDate: '2026-03-22',
      search: 'AMAZON',
      offset: 0,
    });
  });

  it('requests at most the 500 finance caps its limit at', async () => {
    const { handle, calls } = stubHandle([page([])]);
    await createFinanceClient(() => handle).fetchCandidates(WINDOW);
    expect(calls[0]?.['limit']).toBe(500);
  });

  it('pages until the producer says there is no more', async () => {
    const { handle, calls } = stubHandle([
      page([row({ id: 'a' })], true, 0),
      page([row({ id: 'b' })], false, 500),
    ]);
    const result = await createFinanceClient(() => handle).fetchCandidates(WINDOW);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.transactions.map((t) => t.id)).toEqual(['a', 'b']);
    expect(calls[1]?.['offset']).toBe(500);
  });
});

describe('an outage is not an empty window', () => {
  // The single most important behaviour in this file. Auto-links are
  // re-derived by tearing down unconfirmed links and re-solving against
  // whatever is found, so "finance is down" reading as "no transactions
  // exist" would unlink correctly matched orders fleet-wide.

  it('reports unavailable rather than an empty result when finance is down', async () => {
    const { handle } = stubHandle([{ kind: 'unavailable', pillar: 'finance' }]);
    const result = await createFinanceClient(() => handle).fetchCandidates(WINDOW);

    expect(result.kind).toBe('unavailable');
  });

  it.each(['unavailable', 'degraded', 'not-found', 'bad-request'] as const)(
    'treats a %s result as unreadable, never as empty',
    async (kind) => {
      const { handle } = stubHandle([{ kind } as unknown as CallResult<unknown>]);
      const result = await createFinanceClient(() => handle).fetchCandidates(WINDOW);
      expect(result.kind).toBe('unavailable');
    }
  );

  it('still reports ok for a genuinely empty window', async () => {
    const { handle } = stubHandle([page([])]);
    const result = await createFinanceClient(() => handle).fetchCandidates(WINDOW);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.transactions).toHaveLength(0);
  });

  it('does not lose a partial page to an outage midway through paging', async () => {
    // Half a window is worse than none: the solver would re-derive against
    // transactions it cannot see and produce confident wrong answers.
    const { handle } = stubHandle([
      page([row({ id: 'a' })], true, 0),
      { kind: 'unavailable', pillar: 'finance' },
    ]);
    const result = await createFinanceClient(() => handle).fetchCandidates(WINDOW);

    expect(result.kind).toBe('unavailable');
  });
});

describe('a producer-side shape change', () => {
  it('is caught by validation rather than becoming NaN cents', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { handle } = stubHandle([
      { kind: 'ok', value: { data: [{ ...row(), amount: '41.28' }], pagination: {} } },
    ]);

    const result = await createFinanceClient(() => handle).fetchCandidates(WINDOW);

    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.reason).toBe('contract-mismatch');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is caught when the envelope itself is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { handle } = stubHandle([{ kind: 'ok', value: { unexpected: true } }]);

    expect((await createFinanceClient(() => handle).fetchCandidates(WINDOW)).kind).toBe(
      'unavailable'
    );
    warn.mockRestore();
  });
});

describe('the paging safety cap', () => {
  it('reports unavailable rather than returning a truncated window', async () => {
    // Truncation here is the dangerous outcome, not the safe one — a short
    // read looks like a complete window to the solver.
    const { handle } = stubHandle([page([row()], true, 0)]);
    const result = await createFinanceClient(() => handle, { maxPages: 3 }).fetchCandidates(WINDOW);

    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.reason).toContain('safety cap');
  });
});
