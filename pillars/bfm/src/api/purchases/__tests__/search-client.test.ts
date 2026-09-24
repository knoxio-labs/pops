import { describe, expect, it } from 'vitest';

/**
 * The search half of the purchases leg: what bfm sends to `purchases`' own
 * `POST /search`, and what it makes of what comes back.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createPillarGateway, isGatewayOk } from '../../pillars/gateway.js';
import { createMobilePurchasesClient } from '../client.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../../pillars/gateway.js';

interface SearchCall {
  readonly body: { readonly query: { readonly text: string; readonly filters?: unknown } };
}

function factoryOver(
  hits: readonly Record<string, unknown>[],
  onSearch?: (call: SearchCall) => void
): PillarHandleFactory {
  return (<TRouter>(pillarId: string) =>
    fakePillarHandle<TRouter>(pillarId, {
      search: {
        search: (input) => {
          onSearch?.(input as SearchCall);
          return { kind: 'ok', value: { hits } };
        },
      },
      purchase: {
        tagVocabulary: () => ({
          kind: 'ok',
          value: {
            tags: [
              { tag: 'snack', count: 2 },
              { tag: 'drink', count: 1 },
            ],
          },
        }),
      },
    })) as PillarHandleFactory;
}

function clientOver(factory: PillarHandleFactory) {
  return createMobilePurchasesClient(createPillarGateway(factory));
}

const ORDER_HIT = {
  uri: 'pops:purchases/purchase/pur-1',
  score: 1,
  matchField: 'merchantEntityName',
  matchType: 'exact',
  data: {
    source: 'receipt',
    sourceOrderId: null,
    merchantEntityId: null,
    merchantEntityName: 'Bunnings',
    orderedAt: '2026-08-13T02:15:00.000Z',
    orderedAtOffsetMinutes: 600,
    currency: 'AUD',
    totalCents: 4200,
    status: 'awaiting_settlement',
  },
};

const ITEM_HIT = {
  uri: 'pops:purchases/purchase-item/item-1',
  score: 0.5,
  matchField: 'tag',
  matchType: 'contains',
  data: {
    purchaseId: 'pur-1',
    name: 'Trail mix',
    sku: { value: 'B0X', scheme: 'asin' },
    quantity: 2,
    lineTotalCents: 800,
    totalCents: 4200,
    refundedCents: 0,
    orderedAt: '2026-08-13T02:15:00.000Z',
    orderedAtOffsetMinutes: 600,
    currency: 'AUD',
    merchantEntityName: 'Bunnings',
    status: 'linked',
    matchedTag: 'snack',
  },
};

describe('search — mapping a hit of each kind', () => {
  it('maps an order hit to the purchase variant, with the day and no matchedText for a name match', async () => {
    const outcome = await clientOver(factoryOver([ORDER_HIT])).search({ q: 'bunnings' });

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.hits).toEqual([
      {
        kind: 'purchase',
        id: 'pur-1',
        merchantName: 'Bunnings',
        totalCents: 4200,
        currency: 'AUD',
        orderedOn: '2026-08-13',
        status: 'awaiting_settlement',
        matchField: 'merchantEntityName',
        matchedText: null,
      },
    ]);
  });

  it('maps an item hit to the item variant, carrying the order status and its matched tag', async () => {
    const outcome = await clientOver(factoryOver([ITEM_HIT])).search({ q: 'snack' });

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.hits).toEqual([
      {
        kind: 'item',
        id: 'item-1',
        purchaseId: 'pur-1',
        name: 'Trail mix',
        quantity: 2,
        lineTotalCents: 800,
        totalCents: 4200,
        currency: 'AUD',
        merchantName: 'Bunnings',
        orderedOn: '2026-08-13',
        status: 'linked',
        matchField: 'tag',
        matchedText: 'snack',
      },
    ]);
  });

  it('surfaces a sourceOrderId match as matchedText — a field not otherwise shown', async () => {
    const hit = {
      ...ORDER_HIT,
      matchField: 'sourceOrderId',
      data: { ...ORDER_HIT.data, sourceOrderId: '249-1512883-0105415' },
    };
    const outcome = await clientOver(factoryOver([hit])).search({ q: '249' });

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.hits[0]?.matchedText).toBe('249-1512883-0105415');
  });

  it('maps a gateway-schema-mismatch the same way listPurchases does', async () => {
    const factory: PillarHandleFactory = (<TRouter>(pillarId: string) =>
      fakePillarHandle<TRouter>(pillarId, {
        search: { search: () => ({ kind: 'ok', value: { hits: 'not-an-array' } }) },
      })) as PillarHandleFactory;

    const outcome = await clientOver(factory).search({ q: 'x' });

    expect(isGatewayOk(outcome)).toBe(false);
    if (isGatewayOk(outcome)) return;
    expect(outcome.kind).toBe('contract-mismatch');
  });

  it('maps an unrecognised uri prefix to a contract-mismatch outcome rather than passing it through', async () => {
    const rogue = { ...ORDER_HIT, uri: 'pops:purchases/something-else/x' };
    const outcome = await clientOver(factoryOver([rogue])).search({ q: 'bunnings' });

    expect(isGatewayOk(outcome)).toBe(false);
    if (isGatewayOk(outcome)) return;
    expect(outcome.kind).toBe('contract-mismatch');
  });
});

describe('search — forwarding filters', () => {
  it('sends status as the pillar’s structured filter', async () => {
    let sent: SearchCall | undefined;
    await clientOver(factoryOver([], (call) => (sent = call))).search({
      q: 'bunnings',
      status: 'linked',
    });

    expect(sent?.body.query.filters).toEqual([
      { field: 'status', operator: 'eq', value: 'linked' },
    ]);
  });

  it('sends every chosen tag as its own eq filter', async () => {
    let sent: SearchCall | undefined;
    await clientOver(factoryOver([], (call) => (sent = call))).search({
      q: 'bunnings',
      tags: ['snack', 'drink'],
    });

    expect(sent?.body.query.filters).toEqual([
      { field: 'tags', operator: 'eq', value: 'snack' },
      { field: 'tags', operator: 'eq', value: 'drink' },
    ]);
  });

  it('sends no filter at all when neither status nor tags is given', async () => {
    let sent: SearchCall | undefined;
    await clientOver(factoryOver([], (call) => (sent = call))).search({ q: 'bunnings' });

    expect(sent?.body.query.filters).toBeUndefined();
  });

  it('sends the query text unchanged', async () => {
    let sent: SearchCall | undefined;
    await clientOver(factoryOver([], (call) => (sent = call))).search({ q: 'bunnings warehouse' });

    expect(sent?.body.query.text).toBe('bunnings warehouse');
  });
});

describe('tagVocabulary', () => {
  it('passes the vocabulary through unchanged', async () => {
    const outcome = await clientOver(factoryOver([])).tagVocabulary();

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.tags).toEqual([
      { tag: 'snack', count: 2 },
      { tag: 'drink', count: 1 },
    ]);
  });

  it('reports a gateway failure without inventing a vocabulary', async () => {
    const factory: PillarHandleFactory = (<TRouter>(pillarId: string) =>
      fakePillarHandle<TRouter>(pillarId, {
        purchase: {
          tagVocabulary: (): CallResult<unknown> => ({ kind: 'unavailable', pillar: 'purchases' }),
        },
      })) as PillarHandleFactory;

    const outcome = await clientOver(factory).tagVocabulary();

    expect(isGatewayOk(outcome)).toBe(false);
  });
});
