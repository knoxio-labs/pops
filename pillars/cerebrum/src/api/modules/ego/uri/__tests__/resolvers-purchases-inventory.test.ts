import { describe, expect, it, vi } from 'vitest';

import { defaultUriResolvers } from '../index.js';
import { ObjectUriResolver } from '../resolver.js';

import type { GatewayCaller, GatewayCallResult } from '../../gateway/gateway-client.js';

function makeCaller(result: GatewayCallResult) {
  return {
    listTools: vi.fn<GatewayCaller['listTools']>().mockResolvedValue([]),
    callTool: vi.fn<GatewayCaller['callTool']>().mockResolvedValue(result),
  } satisfies GatewayCaller;
}

function success(payload: unknown): GatewayCallResult {
  return { text: JSON.stringify(payload), isError: false };
}

describe('purchase and inventory URI resolvers', () => {
  it('resolves a purchase with the merchant title and formatted date and amount', async () => {
    const caller = makeCaller(
      success({
        purchase: {
          merchantEntityName: 'Acme Market',
          source: 'online',
          orderedAt: '2026-09-14T10:30:00.000Z',
          totalCents: 4250,
          currency: 'AUD',
        },
      })
    );
    const resolver = new ObjectUriResolver(caller, defaultUriResolvers);
    const uri = 'pops:purchases/purchase/order_1';

    await expect(resolver.resolve(uri)).resolves.toEqual({
      uri,
      title: 'Acme Market',
      subtitle: '2026-09-14 · 42.50 AUD',
    });
    expect(caller.callTool).toHaveBeenCalledWith('purchases.orders.get', { id: 'order_1' });
  });

  it('uses the purchase source when the merchant name is null', async () => {
    const caller = makeCaller(
      success({
        purchase: {
          merchantEntityName: null,
          source: 'marketplace',
          orderedAt: '2026-09-14T10:30:00.000Z',
          totalCents: 4250,
          currency: 'AUD',
        },
      })
    );

    await expect(
      new ObjectUriResolver(caller, defaultUriResolvers).resolve('pops:purchases/purchase/order_2')
    ).resolves.toEqual({
      uri: 'pops:purchases/purchase/order_2',
      title: 'marketplace',
      subtitle: '2026-09-14 · 42.50 AUD',
    });
    expect(caller.callTool).toHaveBeenCalledWith('purchases.orders.get', { id: 'order_2' });
  });

  it('resolves an inventory item with a type key subtitle and omits a null type key', async () => {
    const caller = makeCaller(success({ item: { name: 'Blue mug', typeKey: 'kitchenware' } }));
    const resolver = new ObjectUriResolver(caller, defaultUriResolvers);

    await expect(resolver.resolve('pops:inventory/item/item_1')).resolves.toEqual({
      uri: 'pops:inventory/item/item_1',
      title: 'Blue mug',
      subtitle: 'kitchenware',
    });
    caller.callTool.mockResolvedValueOnce(success({ item: { name: 'Spare mug', typeKey: null } }));
    await expect(resolver.resolve('pops:inventory/item/item_2')).resolves.toEqual({
      uri: 'pops:inventory/item/item_2',
      title: 'Spare mug',
    });
    expect(caller.callTool).toHaveBeenNthCalledWith(1, 'inventory.items.get', { id: 'item_1' });
    expect(caller.callTool).toHaveBeenNthCalledWith(2, 'inventory.items.get', { id: 'item_2' });
  });

  it('returns null for an empty inventory item name', async () => {
    const caller = makeCaller(success({ item: { name: '', typeKey: 'kitchenware' } }));

    await expect(
      new ObjectUriResolver(caller, defaultUriResolvers).resolve('pops:inventory/item/item_1')
    ).resolves.toBeNull();
  });

  it('does not resolve purchase-item URIs or call the gateway', async () => {
    const caller = makeCaller(success({}));

    await expect(
      new ObjectUriResolver(caller, defaultUriResolvers).resolve(
        'pops:purchases/purchase-item/line_1'
      )
    ).resolves.toBeNull();
    expect(caller.callTool).not.toHaveBeenCalled();
  });
});
