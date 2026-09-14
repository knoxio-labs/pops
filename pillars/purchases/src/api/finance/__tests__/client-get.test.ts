import { describe, expect, it, vi } from 'vitest';

import { createFinanceClient, type FinanceRouter } from '../client.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/server';

function unused(): Promise<never> {
  return Promise.reject(new Error('not called by getTransaction'));
}

/** A handle whose `transactions.get` answers with `result`, recording the ids asked for. */
function handleAnswering(result: CallResult<unknown>): {
  handle: PillarHandle<FinanceRouter>;
  ids: string[];
} {
  const ids: string[] = [];
  const handle: PillarHandle<FinanceRouter> = {
    transactions: {
      list: Object.assign(() => unused(), { orThrow: unused }),
      get: Object.assign(
        (input: { id: string }) => {
          ids.push(input.id);
          return Promise.resolve(result);
        },
        { orThrow: unused }
      ),
    },
    callDynamic: () => unused(),
  };
  return { handle, ids };
}

const wireRow = {
  id: 'txn-1',
  description: 'THE GOOD GUYS',
  accountId: 'gift-card',
  amount: -337,
  date: '2026-03-04',
  type: 'purchase',
  entityId: null,
  entityName: null,
};

describe('getTransaction', () => {
  it('reads one transaction by id, in integer cents with its URI', async () => {
    const { handle, ids } = handleAnswering({ kind: 'ok', value: { data: wireRow } });

    const result = await createFinanceClient(() => handle).getTransaction('txn-1');

    expect(ids).toEqual(['txn-1']);
    expect(result).toMatchObject({
      kind: 'ok',
      transaction: {
        uri: 'pops://finance/transaction/txn-1',
        amountCents: -33700,
        type: 'purchase',
      },
    });
  });

  it('keeps a missing transaction apart from an unreachable finance', async () => {
    const { handle } = handleAnswering({ kind: 'not-found', pillar: 'finance' });

    expect(await createFinanceClient(() => handle).getTransaction('ghost')).toEqual({
      kind: 'not-found',
    });
  });

  it('reports an unreachable finance as unavailable', async () => {
    const { handle } = handleAnswering({ kind: 'unavailable', pillar: 'finance' });

    expect(await createFinanceClient(() => handle).getTransaction('txn-1')).toEqual({
      kind: 'unavailable',
      reason: 'unavailable',
    });
  });

  it('treats a body it cannot read as unavailable rather than as a transaction', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { handle } = handleAnswering({
      kind: 'ok',
      value: { data: { ...wireRow, amount: 'x' } },
    });

    expect(await createFinanceClient(() => handle).getTransaction('txn-1')).toEqual({
      kind: 'unavailable',
      reason: 'contract-mismatch',
    });
    vi.restoreAllMocks();
  });

  it('asks nothing when this process has no credential', async () => {
    expect(await createFinanceClient(() => null).getTransaction('txn-1')).toEqual({
      kind: 'unavailable',
      reason: 'no-credential',
    });
  });
});
