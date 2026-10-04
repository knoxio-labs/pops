import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callOk,
  callUnavailable,
  extractText,
  mockPillarInventory,
  mockPillarPurchases,
  pillarMockGetter,
} from './test-helpers.js';

import type { CallResult } from '@pops/pillar-sdk/client';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { inventoryProposalTools } = await import('./purchases-inventory-proposals.js');

const purchase = mockPillarPurchases.purchases.purchase;
const inventoryGet = mockPillarInventory.inventory.web.get;

const ORDER_ID = 'order-1';
const LINE_ID = 'line-1';
const ITEM_ID = '20000000-0000-4000-8000-000000000001';

const notFound = (pillar: string, message: string): CallResult<never> => ({
  kind: 'not-found',
  pillar,
  message,
});
const conflict = (pillar: string, message: string): CallResult<never> => ({
  kind: 'conflict',
  pillar,
  message,
});

function tool(name: string) {
  const found = inventoryProposalTools.find((t) => t.name === name);
  if (!found) throw new Error(`no such tool: ${name}`);
  return found;
}

const accept = (args: Record<string, unknown>) =>
  tool('purchases.inventoryProposals.accept').handler(args);

beforeEach(() => {
  vi.clearAllMocks();
  purchase.listInventoryProposals.mockResolvedValue(callOk({ proposals: [] }));
  purchase.decideInventoryProposal.mockResolvedValue(callOk({ unit: { id: 'unit-1' } }));
  inventoryGet.mockResolvedValue(callOk({ item: { id: ITEM_ID, deletedAt: null } }));
});

describe('purchases.inventoryProposals.list', () => {
  it('asks for one order and returns its proposals verbatim', async () => {
    purchase.listInventoryProposals.mockResolvedValueOnce(
      callOk({ proposals: [{ itemId: LINE_ID, unitId: null, itemName: 'Bookends' }] })
    );
    const result = await tool('purchases.inventoryProposals.list').handler({ orderId: ORDER_ID });

    expect(purchase.listInventoryProposals).toHaveBeenCalledWith({ id: ORDER_ID });
    expect(extractText(result)).toContain('Bookends');
  });

  it('refuses to call the pillar without an order id', async () => {
    const result = await tool('purchases.inventoryProposals.list').handler({});

    expect(result.isError).toBe(true);
    expect(purchase.listInventoryProposals).not.toHaveBeenCalled();
  });

  it('surfaces an unavailable pillar as a tool error', async () => {
    purchase.listInventoryProposals.mockResolvedValueOnce(callUnavailable('purchases'));

    const result = await tool('purchases.inventoryProposals.list').handler({ orderId: ORDER_ID });

    expect(result.isError).toBe(true);
  });
});

describe('purchases.inventoryProposals.accept', () => {
  it('records an accept naming the existing item, and only an accept', async () => {
    const result = await accept({ orderId: ORDER_ID, itemId: LINE_ID, inventoryItemId: ITEM_ID });

    expect(result.isError).toBeFalsy();
    expect(inventoryGet).toHaveBeenCalledWith({ id: ITEM_ID });
    expect(purchase.decideInventoryProposal).toHaveBeenCalledTimes(1);
    expect(purchase.decideInventoryProposal.mock.calls[0]?.[0]).toEqual({
      id: ORDER_ID,
      itemId: LINE_ID,
      decision: 'accepted',
      inventoryItemUri: `pops://inventory/item/${ITEM_ID}`,
    });
  });

  it('tells the model an accept does not depend on a listed offer', () => {
    // The list is empty for every unclassified line, which is most of them.
    // A description that sent the model there first made the tool unusable.
    const description = tool('purchases.inventoryProposals.accept').description;
    expect(description).toContain('works on any line');
    expect(description).not.toMatch(/list first/i);
    expect(tool('purchases.inventoryProposals.list').description).toContain(
      'does not mean nothing can be linked'
    );
  });

  it('accepts without ever reading the proposal list', async () => {
    await accept({ orderId: ORDER_ID, itemId: LINE_ID, inventoryItemId: ITEM_ID });

    expect(purchase.listInventoryProposals).not.toHaveBeenCalled();
    expect(purchase.decideInventoryProposal).toHaveBeenCalledTimes(1);
  });

  it('sends the unit id when the proposal carries one', async () => {
    await accept({
      orderId: ORDER_ID,
      itemId: LINE_ID,
      unitId: 'unit-7',
      inventoryItemId: ITEM_ID,
    });

    expect(purchase.decideInventoryProposal.mock.calls[0]?.[0]).toMatchObject({
      unitId: 'unit-7',
    });
  });

  it.each([
    ['orderId', { itemId: LINE_ID, inventoryItemId: ITEM_ID }],
    ['itemId', { orderId: ORDER_ID, inventoryItemId: ITEM_ID }],
    ['inventoryItemId', { orderId: ORDER_ID, itemId: LINE_ID }],
  ])('refuses an accept missing %s before touching either pillar', async (field, args) => {
    const result = await accept(args);

    expect(result.isError).toBe(true);
    expect(extractText(result)).toBe(`Missing required field: ${field}`);
    expect(inventoryGet).not.toHaveBeenCalled();
    expect(purchase.decideInventoryProposal).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', ''],
    ['not a string', 7],
    ['null', null],
  ])('refuses a unit id that is %s', async (_case, unitId) => {
    const result = await accept({
      orderId: ORDER_ID,
      itemId: LINE_ID,
      inventoryItemId: ITEM_ID,
      unitId,
    });

    expect(extractText(result)).toBe('Invalid field: unitId');
    expect(purchase.decideInventoryProposal).not.toHaveBeenCalled();
  });

  it('records nothing when inventory has no such item', async () => {
    inventoryGet.mockResolvedValueOnce(notFound('inventory', 'Item not found'));

    const result = await accept({ orderId: ORDER_ID, itemId: LINE_ID, inventoryItemId: ITEM_ID });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('Item not found');
    expect(purchase.decideInventoryProposal).not.toHaveBeenCalled();
  });

  it('records nothing when the inventory item is deleted', async () => {
    inventoryGet.mockResolvedValueOnce(
      callOk({ item: { id: ITEM_ID, deletedAt: '2026-10-01T00:00:00.000Z' } })
    );

    const result = await accept({ orderId: ORDER_ID, itemId: LINE_ID, inventoryItemId: ITEM_ID });

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('is deleted');
    expect(purchase.decideInventoryProposal).not.toHaveBeenCalled();
  });

  it('records nothing when inventory cannot be reached to check the item', async () => {
    inventoryGet.mockResolvedValueOnce(callUnavailable('inventory'));

    const result = await accept({ orderId: ORDER_ID, itemId: LINE_ID, inventoryItemId: ITEM_ID });

    expect(result.isError).toBe(true);
    expect(purchase.decideInventoryProposal).not.toHaveBeenCalled();
  });

  it.each([
    ['an already-answered slot', conflict('purchases', 'Proposal already decided')],
    ['a line nothing proposes', notFound('purchases', 'No open proposal')],
    ['an unavailable pillar', callUnavailable('purchases')],
  ])('surfaces %s as a tool error', async (_case, failure) => {
    purchase.decideInventoryProposal.mockResolvedValueOnce(failure);

    const result = await accept({ orderId: ORDER_ID, itemId: LINE_ID, inventoryItemId: ITEM_ID });

    expect(result.isError).toBe(true);
  });
});
