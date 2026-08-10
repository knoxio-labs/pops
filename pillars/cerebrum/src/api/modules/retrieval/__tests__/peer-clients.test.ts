/**
 * Unit tests for {@link createPeerClients}, driven against hand-built stubs of
 * the finance / media / inventory pillar handles.
 *
 * The three things pinned here are the three the bare-`fetch` version could
 * get wrong without anything noticing: the operation each enrichment path
 * reaches for, the paging window it sends, and the difference between "the
 * owning pillar has no such row" (null / empty page, the hit is dropped) and
 * "the owning pillar could not answer" (throws, and the caller falls back to
 * keyword search instead of reporting an empty world).
 */
import { describe, expect, it } from 'vitest';

import {
  type CallDynamicFn,
  type CallableProcedure,
  type CallResult,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import {
  createPeerClients,
  PeerCallError,
  type FinanceRouter,
  type InventoryRouter,
  type MediaRouter,
} from '../peer-clients.js';

function ok<T>(value: T): CallResult<T> {
  return { kind: 'ok', value };
}

function proc<Args extends readonly unknown[], Output>(
  fn: (...args: Args) => Promise<CallResult<Output>>
): CallableProcedure<Args, Output> {
  const orThrow = async (...args: Args): Promise<Output> => {
    const result = await fn(...args);
    if (result.kind !== 'ok') throw new Error(`stub orThrow: ${result.kind}`);
    return result.value;
  };
  return Object.assign(fn, { orThrow });
}

const callDynamic: CallDynamicFn = () => {
  throw new Error('callDynamic is not used by the peer clients');
};

function unexpected(name: string): never {
  throw new Error(`stub ${name} called unexpectedly`);
}

type Stub<TFn extends (input: never) => Promise<unknown>> = (
  input: Parameters<TFn>[0]
) => Promise<CallResult<Awaited<ReturnType<TFn>>>>;

interface FinanceStubs {
  get?: Stub<FinanceRouter['transactions']['get']>;
  list?: Stub<FinanceRouter['transactions']['list']>;
}

interface MediaStubs {
  getMovie?: Stub<MediaRouter['movies']['get']>;
  listMovies?: Stub<MediaRouter['movies']['list']>;
  getTvShow?: Stub<MediaRouter['tvShows']['get']>;
  listTvShows?: Stub<MediaRouter['tvShows']['list']>;
}

interface InventoryStubs {
  get?: Stub<InventoryRouter['items']['get']>;
  list?: Stub<InventoryRouter['items']['list']>;
}

function financeHandle(stubs: FinanceStubs): PillarHandle<FinanceRouter> {
  return {
    transactions: {
      get: proc(stubs.get ?? (() => unexpected('transactions.get'))),
      list: proc(stubs.list ?? (() => unexpected('transactions.list'))),
    },
    callDynamic,
  };
}

function mediaHandle(stubs: MediaStubs): PillarHandle<MediaRouter> {
  return {
    movies: {
      get: proc(stubs.getMovie ?? (() => unexpected('movies.get'))),
      list: proc(stubs.listMovies ?? (() => unexpected('movies.list'))),
    },
    tvShows: {
      get: proc(stubs.getTvShow ?? (() => unexpected('tvShows.get'))),
      list: proc(stubs.listTvShows ?? (() => unexpected('tvShows.list'))),
    },
    callDynamic,
  };
}

function inventoryHandle(stubs: InventoryStubs): PillarHandle<InventoryRouter> {
  return {
    items: {
      get: proc(stubs.get ?? (() => unexpected('items.get'))),
      list: proc(stubs.list ?? (() => unexpected('items.list'))),
    },
    callDynamic,
  };
}

function withFinance(stubs: FinanceStubs) {
  const clients = createPeerClients({ finance: () => financeHandle(stubs) });
  if (!clients.finance) throw new Error('finance client must be built');
  return clients.finance;
}

function withMedia(stubs: MediaStubs) {
  const clients = createPeerClients({ media: () => mediaHandle(stubs) });
  if (!clients.media) throw new Error('media client must be built');
  return clients.media;
}

function withInventory(stubs: InventoryStubs) {
  const clients = createPeerClients({ inventory: () => inventoryHandle(stubs) });
  if (!clients.inventory) throw new Error('inventory client must be built');
  return clients.inventory;
}

describe('createPeerClients', () => {
  it('builds every peer client, so a peer is never silently absent at boot', () => {
    const clients = createPeerClients();

    expect(clients.finance).toBeDefined();
    expect(clients.media).toBeDefined();
    expect(clients.inventory).toBeDefined();
  });
});

describe('finance enrichment', () => {
  it('unwraps the data envelope of a single transaction', async () => {
    const seen: unknown[] = [];
    const finance = withFinance({
      get: async (input) => {
        seen.push(input);
        return ok({ data: { description: 'Coffee', tags: ['food'] } });
      },
    });

    await expect(finance.getTransaction('tx-1')).resolves.toEqual({
      description: 'Coffee',
      tags: ['food'],
    });
    expect(seen).toEqual([{ id: 'tx-1' }]);
  });

  it('reports a row finance does not have as unresolvable, not as a failure', async () => {
    const finance = withFinance({
      get: async () => ({ kind: 'not-found', pillar: 'finance' }),
    });

    await expect(finance.getTransaction('missing')).resolves.toBeNull();
  });

  it('treats a success carrying no data as unresolvable', async () => {
    const finance = withFinance({ get: async () => ok({}) });

    await expect(finance.getTransaction('tx-1')).resolves.toBeNull();
  });

  it('throws when finance cannot answer, rather than dropping the hit quietly', async () => {
    const finance = withFinance({
      get: async () => ({ kind: 'unavailable', pillar: 'finance' }),
    });

    await expect(finance.getTransaction('tx-1')).rejects.toBeInstanceOf(PeerCallError);
  });

  it('sends the paging window and reads the pagination cursor', async () => {
    const seen: unknown[] = [];
    const finance = withFinance({
      list: async (input) => {
        seen.push(input);
        return ok({ data: [{ id: 'tx-1' }], pagination: { hasMore: true } });
      },
    });

    await expect(finance.listTransactions(100, 200)).resolves.toEqual({
      rows: [{ id: 'tx-1' }],
      hasMore: true,
    });
    expect(seen).toEqual([{ limit: 100, offset: 200 }]);
  });

  it('reads a page with no pagination block as the last page', async () => {
    const finance = withFinance({ list: async () => ok({ data: [] }) });

    await expect(finance.listTransactions(100, 0)).resolves.toEqual({ rows: [], hasMore: false });
  });

  it('stops the scan loudly when a page cannot be fetched', async () => {
    const finance = withFinance({
      list: async () => ({ kind: 'unavailable', pillar: 'finance' }),
    });

    await expect(finance.listTransactions(100, 0)).rejects.toThrow(
      /finance transactions\.list failed \(unavailable\)/u
    );
  });
});

describe('media enrichment', () => {
  it('reaches movies.get with a numeric id', async () => {
    const seen: unknown[] = [];
    const media = withMedia({
      getMovie: async (input) => {
        seen.push(input);
        return ok({ data: { title: 'Arrival' } });
      },
    });

    await expect(media.getMovie(12)).resolves.toEqual({ title: 'Arrival' });
    expect(seen).toEqual([{ id: 12 }]);
  });

  it('reaches tvShows.get, which is a different operation from movies.get', async () => {
    const media = withMedia({ getTvShow: async () => ok({ data: { name: 'Severance' } }) });

    await expect(media.getTvShow(3)).resolves.toEqual({ name: 'Severance' });
  });

  it('pages movies and tv shows through their own list operations', async () => {
    const media = withMedia({
      listMovies: async () => ok({ data: [{ id: 1 }], pagination: { hasMore: false } }),
      listTvShows: async () => ok({ data: [{ id: 2 }], pagination: { hasMore: true } }),
    });

    await expect(media.listMovies(50, 0)).resolves.toEqual({ rows: [{ id: 1 }], hasMore: false });
    await expect(media.listTvShows(50, 0)).resolves.toEqual({ rows: [{ id: 2 }], hasMore: true });
  });

  it('carries the producer message into the thrown error', async () => {
    const media = withMedia({
      getMovie: async () => ({
        kind: 'bad-request',
        pillar: 'media',
        message: 'id must be an int',
      }),
    });

    await expect(media.getMovie(12)).rejects.toThrow(/id must be an int/u);
  });
});

describe('inventory enrichment', () => {
  it('reaches items.get with the string id', async () => {
    const seen: unknown[] = [];
    const inventory = withInventory({
      get: async (input) => {
        seen.push(input);
        return ok({ data: { itemName: 'Drill', brand: 'Makita' } });
      },
    });

    await expect(inventory.getItem('item-1')).resolves.toEqual({
      itemName: 'Drill',
      brand: 'Makita',
    });
    expect(seen).toEqual([{ id: 'item-1' }]);
  });

  it('reads an absent item as unresolvable', async () => {
    const inventory = withInventory({
      get: async () => ({ kind: 'not-found', pillar: 'inventory' }),
    });

    await expect(inventory.getItem('gone')).resolves.toBeNull();
  });

  it('pages items with the requested window', async () => {
    const seen: unknown[] = [];
    const inventory = withInventory({
      list: async (input) => {
        seen.push(input);
        return ok({ data: [{ id: 'item-1' }], pagination: { hasMore: false } });
      },
    });

    await expect(inventory.listItems(25, 50)).resolves.toEqual({
      rows: [{ id: 'item-1' }],
      hasMore: false,
    });
    expect(seen).toEqual([{ limit: 25, offset: 50 }]);
  });
});
