import { afterEach, expect, it, vi } from 'vitest';

import { __resetServerSdkConfig, type CallFailure, type CallResult } from '@pops/pillar-sdk/server';
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createInventoryLinkClearer, type InventoryWriteRouter } from '../client.js';

afterEach(() => {
  vi.restoreAllMocks();
  __resetServerSdkConfig();
});

function clearerAnswering(answer: CallResult<unknown>, seen: unknown[] = []) {
  return createInventoryLinkClearer(
    fakePillarHandle<InventoryWriteRouter>('inventory', {
      items: {
        update: (input) => {
          seen.push(input);
          return answer;
        },
      },
    })
  );
}

it('clears only the requested item’s purchase pointer', async () => {
  const seen: unknown[] = [];
  await expect(clearerAnswering({ kind: 'ok', value: {} }, seen).clear('item-1')).resolves.toEqual({
    kind: 'cleared',
  });
  expect(seen).toEqual([{ id: 'item-1', purchaseTransactionId: null }]);
});

it('treats an already deleted item as cleared', async () => {
  await expect(
    clearerAnswering({ kind: 'not-found', pillar: 'inventory' }).clear('gone')
  ).resolves.toEqual({ kind: 'cleared' });
});

const failures: readonly CallFailure[] = [
  { kind: 'bad-request', pillar: 'inventory' },
  { kind: 'refused', pillar: 'inventory', status: 422 },
  { kind: 'conflict', pillar: 'inventory' },
  { kind: 'unavailable', pillar: 'inventory' },
  { kind: 'degraded', pillar: 'inventory', reason: 'reconciling' },
  { kind: 'contract-mismatch', pillar: 'inventory' },
  { kind: 'rate-limited', pillar: 'inventory', retryAfterSeconds: 10 },
];

it.each(failures)('does not claim a pointer was cleared after $kind', async (answer) => {
  await expect(clearerAnswering(answer).clear('item-1')).resolves.toEqual({
    kind: 'unavailable',
    reason: answer.kind,
  });
});

it('reports a rejected credential and logs the failed operation', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(
    clearerAnswering({ kind: 'unauthorized', pillar: 'inventory' }).clear('item-1')
  ).resolves.toEqual({ kind: 'unauthorized', reason: 'unauthorized' });
  expect(logged).toHaveBeenCalledWith(expect.stringContaining('items.update'));
});

it('refuses an unconfigured client before any request', async () => {
  __resetServerSdkConfig();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(createInventoryLinkClearer().clear('item-1')).resolves.toEqual({
    kind: 'unauthorized',
    reason: 'no-credential',
  });
});

it.each([new Error('connection closed'), 'connection closed'])(
  'keeps a thrown transport failure retryable: %s',
  async (failure) => {
    const clearer = createInventoryLinkClearer(
      fakePillarHandle<InventoryWriteRouter>('inventory', {
        items: {
          update: () => {
            throw failure;
          },
        },
      })
    );
    await expect(clearer.clear('item-1')).resolves.toEqual({
      kind: 'unavailable',
      reason: 'connection closed',
    });
  }
);
