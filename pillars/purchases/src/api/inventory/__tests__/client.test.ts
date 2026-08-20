/**
 * How the create leg folds inventory's answer, which is the half that
 * decides what a person is told.
 *
 * Every branch here is a different remedy: widen a grant, wait, fix a
 * payload, or go looking for a row nothing can name. Folding any two of
 * them together produces a message that sends someone to do the wrong
 * thing — and the fold that would hurt most is `unreadable`, the one case
 * where an asset may exist with no URI to complete the pair.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createInventoryAssetCreator, type InventoryWriteRouter } from '../client.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { InventoryProposal } from '../../../db/index.js';

const OFFER: InventoryProposal = {
  purchaseId: 'p-1',
  itemId: 'i-1',
  unitId: null,
  slot: 0,
  itemName: 'Cordless Drill',
  serialNumber: null,
  purchaseDate: '2026-02-02T23:41:21.000Z',
  purchasePriceCents: 19900,
  purchasedFromName: 'Bunnings Warehouse',
  purchaseTransactionUri: 'pops://finance/transaction/t-9',
  kindConfirmed: true,
};

const previousZone = process.env['PURCHASES_TIME_ZONE'];

beforeEach(() => {
  process.env['PURCHASES_TIME_ZONE'] = 'Australia/Sydney';
});

afterEach(() => {
  if (previousZone === undefined) delete process.env['PURCHASES_TIME_ZONE'];
  else process.env['PURCHASES_TIME_ZONE'] = previousZone;
});

function creatorAnswering(answer: CallResult<unknown>, seen: unknown[] = []) {
  return createInventoryAssetCreator(
    fakePillarHandle<InventoryWriteRouter>('inventory', {
      items: {
        create: (input) => {
          seen.push(input);
          return answer;
        },
      },
    })
  );
}

it('answers the URI of the row inventory minted', async () => {
  const creator = creatorAnswering({ kind: 'ok', value: { data: { id: 'inv-7' } } });

  await expect(creator.create(OFFER)).resolves.toEqual({
    kind: 'created',
    inventoryItemUri: 'pops://inventory/item/inv-7',
  });
});

it("sends the body inventory declares, not this pillar's own row shape", async () => {
  const seen: unknown[] = [];
  await creatorAnswering({ kind: 'ok', value: { data: { id: 'inv-7' } } }, seen).create(OFFER);

  expect(seen).toEqual([
    {
      itemName: 'Cordless Drill',
      purchaseDate: '2026-02-03',
      purchasePrice: 199,
      purchasedFromName: 'Bunnings Warehouse',
      purchaseTransactionId: 't-9',
      inUse: false,
      deductible: false,
      notes: 'Created from purchases order p-1, line i-1.',
    },
  ]);
});

describe('a refused credential is its own outcome', () => {
  it('reports unauthorized rather than an outage', async () => {
    const creator = creatorAnswering({ kind: 'unauthorized', pillar: 'inventory' });

    await expect(creator.create(OFFER)).resolves.toMatchObject({ kind: 'unauthorized' });
  });

  it('logs the account, because nothing here clears on its own', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await creatorAnswering({ kind: 'unauthorized', pillar: 'inventory' }).create(OFFER);
      expect(logged.mock.calls.flat().join(' ')).toContain('items.create');
    } finally {
      logged.mockRestore();
    }
  });
});

describe('everything else keeps its remedy', () => {
  it('treats a rejected payload as permanent, not as an outage', async () => {
    // The body is derived from a proposal, so the same request would be
    // sent again — a caller told "unavailable" would retry forever.
    const creator = creatorAnswering({ kind: 'bad-request', pillar: 'inventory' });

    await expect(creator.create(OFFER)).resolves.toMatchObject({ kind: 'refused' });
  });

  it('treats an unreachable pillar as transient', async () => {
    const creator = creatorAnswering({ kind: 'unavailable', pillar: 'inventory' });

    await expect(creator.create(OFFER)).resolves.toMatchObject({ kind: 'unavailable' });
  });

  it('reports a success carrying no item id as its own kind', async () => {
    // A row may exist that nothing can name. Reported apart from every
    // other failure because it is the only one that can strand an asset
    // with no URI to complete the accept with.
    const creator = creatorAnswering({ kind: 'ok', value: { data: {} } });

    await expect(creator.create(OFFER)).resolves.toEqual({
      kind: 'unreadable',
      reason: 'no-item-id',
    });
  });

  it('logs what inventory actually answered, since that is the only lead to the row', async () => {
    // The kind and the reason reach the caller; the answer itself does not
    // survive `classify`, and it is the only thing naming a row that may
    // exist with nothing anywhere pointing at it.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await creatorAnswering({ kind: 'ok', value: { data: { identifier: 'inv-8' } } }).create(
        OFFER
      );

      expect(JSON.stringify(logged.mock.calls)).toContain('inv-8');
    } finally {
      logged.mockRestore();
    }
  });

  it('survives a transport that throws instead of answering', async () => {
    const creator = createInventoryAssetCreator(
      fakePillarHandle<InventoryWriteRouter>('inventory', {
        items: {
          create: () => {
            throw new Error('socket hang up');
          },
        },
      })
    );

    await expect(creator.create(OFFER)).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'socket hang up',
    });
  });
});
