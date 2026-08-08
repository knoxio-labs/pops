import { describe, expect, it } from 'vitest';

import { PillarCallError } from '../../client/errors.js';
import { fakePillarHandle } from '../fake-handle.js';

import type { FinanceRouter } from '../../client/__tests__/fixtures.js';
import type { PillarHandle } from '../../client/proxy.js';

const ROWS = [{ id: 'wish-1' }] as const;

function financeFake(): { handle: PillarHandle<FinanceRouter>; inputs: unknown[] } {
  const inputs: unknown[] = [];
  const handle = fakePillarHandle<FinanceRouter>('finance', {
    wishlist: {
      list: (input) => {
        inputs.push(input);
        return { kind: 'ok', value: ROWS };
      },
    },
    transactions: {
      imports: {
        create: () => Promise.resolve({ kind: 'not-found', pillar: 'finance' }),
      },
    },
  });
  return { handle, inputs };
}

describe('fakePillarHandle', () => {
  it('answers a drilled call from the object literal', async () => {
    const { handle } = financeFake();
    const result = await handle.wishlist.list({ limit: 10 });
    expect(result).toEqual({ kind: 'ok', value: ROWS });
  });

  it('passes the input through verbatim', async () => {
    const { handle, inputs } = financeFake();
    await handle.wishlist.list({ limit: 3 });
    expect(inputs).toEqual([{ limit: 3 }]);
  });

  it('passes undefined through when the call takes no argument', async () => {
    const { handle, inputs } = financeFake();
    await handle.wishlist.list();
    expect(inputs).toEqual([undefined]);
  });

  it('resolves a nested router.subRouter.procedure path', async () => {
    const { handle } = financeFake();
    const result = await handle.transactions.imports.create({ id: '1' });
    expect(result).toEqual({ kind: 'not-found', pillar: 'finance' });
  });

  it("answers 'contract-mismatch' for a path the fake does not implement", async () => {
    const { handle } = financeFake();
    const result = await handle.unknownRouter.list({});
    expect(result).toEqual({
      kind: 'contract-mismatch',
      pillar: 'finance',
      expected: 'unknownRouter.list',
    });
  });

  it("answers 'contract-mismatch' when a sub-router is called as a procedure", async () => {
    const handle = fakePillarHandle<{ wishlist: () => Promise<unknown> }>('finance', {
      wishlist: { list: () => ({ kind: 'ok', value: ROWS }) },
    });
    const result = await handle.wishlist();
    expect(result).toEqual({
      kind: 'contract-mismatch',
      pillar: 'finance',
      actual: 'wishlist',
    });
  });

  it("answers 'contract-mismatch' when the path drills past a procedure", async () => {
    const handle = fakePillarHandle<{
      wishlist: { list: { deeper: (input?: unknown) => Promise<unknown> } };
    }>('finance', {
      wishlist: { list: () => ({ kind: 'ok', value: ROWS }) },
    });
    const result = await handle.wishlist.list.deeper({});
    expect(result).toEqual({
      kind: 'contract-mismatch',
      pillar: 'finance',
      expected: 'wishlist.list.deeper',
    });
  });

  it('serves callDynamic from the same tree', async () => {
    const { handle, inputs } = financeFake();
    const result = await handle.callDynamic('wishlist', 'list', { limit: 1 });
    expect(result).toEqual({ kind: 'ok', value: ROWS });
    expect(inputs).toEqual([{ limit: 1 }]);
  });

  it('unwraps a success through orThrow()', async () => {
    const { handle } = financeFake();
    await expect(handle.wishlist.list.orThrow({ limit: 1 })).resolves.toEqual(ROWS);
  });

  it('throws a PillarCallError through orThrow() on a failure', async () => {
    const { handle } = financeFake();
    await expect(handle.transactions.imports.create.orThrow({ id: '1' })).rejects.toBeInstanceOf(
      PillarCallError
    );
  });

  it('is returnable from a generic handle factory without a cast', async () => {
    type TransactionsRouter = { transactions: { list: (input?: unknown) => Promise<unknown> } };
    const factory = <TRouter>(pillarId: string): PillarHandle<TRouter> =>
      fakePillarHandle<TRouter>(pillarId, {
        transactions: { list: () => ({ kind: 'ok', value: { data: [] } }) },
      });

    const handle = factory<TransactionsRouter>('finance');
    await expect(handle.transactions.list()).resolves.toEqual({
      kind: 'ok',
      value: { data: [] },
    });
  });
});
