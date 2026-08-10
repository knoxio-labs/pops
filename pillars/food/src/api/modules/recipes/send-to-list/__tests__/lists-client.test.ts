/**
 * Unit tests for {@link createListsClient}, driven against a hand-built stub
 * of the lists pillar handle.
 *
 * Two things are pinned here, and both used to be untestable when this client
 * spoke bare `fetch`: the exact input each operation hands the SDK (the SDK
 * substitutes path params out of that record, so a wrong key silently sends a
 * literal `{listId}` in the URL), and the fact that a peer failure aborts
 * rather than resolving to a plausible empty value.
 */
import { describe, expect, it } from 'vitest';

import {
  type CallDynamicFn,
  type CallableProcedure,
  type CallResult,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import {
  createListsClient,
  ListsCallError,
  type ListHeader,
  type ListsRouter,
} from '../lists-client.js';

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
  throw new Error('callDynamic is not used by the lists client');
};

type Impl<K extends 'get' | 'create'> = ListsRouter['list'][K];
type ItemsImpl<K extends 'add' | 'upsertByRef' | 'search'> = ListsRouter['items'][K];

interface StubImpls {
  get?: (
    input: Parameters<Impl<'get'>>[0]
  ) => Promise<CallResult<Awaited<ReturnType<Impl<'get'>>>>>;
  create?: (
    input: Parameters<Impl<'create'>>[0]
  ) => Promise<CallResult<Awaited<ReturnType<Impl<'create'>>>>>;
  add?: (
    input: Parameters<ItemsImpl<'add'>>[0]
  ) => Promise<CallResult<Awaited<ReturnType<ItemsImpl<'add'>>>>>;
  upsertByRef?: (
    input: Parameters<ItemsImpl<'upsertByRef'>>[0]
  ) => Promise<CallResult<Awaited<ReturnType<ItemsImpl<'upsertByRef'>>>>>;
  search?: (
    input: Parameters<ItemsImpl<'search'>>[0]
  ) => Promise<CallResult<Awaited<ReturnType<ItemsImpl<'search'>>>>>;
}

function unexpected(name: string): never {
  throw new Error(`stub ${name} called unexpectedly`);
}

function stubHandle(impls: StubImpls): PillarHandle<ListsRouter> {
  return {
    list: {
      get: proc(impls.get ?? (() => unexpected('list.get'))),
      create: proc(impls.create ?? (() => unexpected('list.create'))),
    },
    items: {
      add: proc(impls.add ?? (() => unexpected('items.add'))),
      upsertByRef: proc(impls.upsertByRef ?? (() => unexpected('items.upsertByRef'))),
      search: proc(impls.search ?? (() => unexpected('items.search'))),
    },
    callDynamic,
  };
}

const aList: ListHeader = { id: 7, kind: 'shopping', ownerApp: 'food', archivedAt: null };

describe('createListsClient.getList', () => {
  it('substitutes the list id into the operation input', async () => {
    const seen: unknown[] = [];
    const client = createListsClient(() =>
      stubHandle({
        get: async (input) => {
          seen.push(input);
          return ok({ list: aList });
        },
      })
    );

    await expect(client.getList(7)).resolves.toEqual(aList);
    expect(seen).toEqual([{ id: 7 }]);
  });

  it('reads a missing list from the null body lists answers with, not a 404', async () => {
    const client = createListsClient(() => stubHandle({ get: async () => ok(null) }));

    await expect(client.getList(404)).resolves.toBeNull();
  });

  it('still treats a not-found result as an absent list', async () => {
    const client = createListsClient(() =>
      stubHandle({ get: async () => ({ kind: 'not-found', pillar: 'lists' }) })
    );

    await expect(client.getList(404)).resolves.toBeNull();
  });

  it('aborts rather than reporting an absent list when lists is unreachable', async () => {
    const client = createListsClient(() =>
      stubHandle({ get: async () => ({ kind: 'unavailable', pillar: 'lists' }) })
    );

    await expect(client.getList(7)).rejects.toBeInstanceOf(ListsCallError);
  });
});

describe('createListsClient.createShoppingList', () => {
  it('creates a shopping list owned by food and returns the new id', async () => {
    const seen: unknown[] = [];
    const client = createListsClient(() =>
      stubHandle({
        create: async (input) => {
          seen.push(input);
          return ok({ id: 42 });
        },
      })
    );

    await expect(client.createShoppingList('Groceries')).resolves.toBe(42);
    expect(seen).toEqual([{ name: 'Groceries', kind: 'shopping', ownerApp: 'food' }]);
  });

  it('carries the producer message into the thrown error', async () => {
    const client = createListsClient(() =>
      stubHandle({
        create: async () => ({ kind: 'bad-request', pillar: 'lists', message: 'kind is required' }),
      })
    );

    await expect(client.createShoppingList('Groceries')).rejects.toThrow(/kind is required/u);
  });
});

describe('createListsClient.upsertByRef', () => {
  it('flattens the list id alongside the body so the SDK can fill the path', async () => {
    const seen: unknown[] = [];
    const client = createListsClient(() =>
      stubHandle({
        upsertByRef: async (input) => {
          seen.push(input);
          return ok({ outcome: 'merged' as const, itemId: 3 });
        },
      })
    );

    await expect(
      client.upsertByRef(7, {
        refKind: 'ingredient',
        refId: 11,
        label: 'Eggs',
        qty: 6,
        unit: 'ea',
        onConflict: 'merge-additive',
      })
    ).resolves.toEqual({ outcome: 'merged', itemId: 3 });
    expect(seen).toEqual([
      {
        listId: 7,
        refKind: 'ingredient',
        refId: 11,
        label: 'Eggs',
        qty: 6,
        unit: 'ea',
        onConflict: 'merge-additive',
      },
    ]);
  });

  it('aborts on a failed upsert rather than reporting a written item', async () => {
    const client = createListsClient(() =>
      stubHandle({ upsertByRef: async () => ({ kind: 'not-found', pillar: 'lists' }) })
    );

    await expect(
      client.upsertByRef(7, { refKind: 'custom', refId: 1, label: 'Eggs' })
    ).rejects.toThrow(/items\.upsertByRef failed \(not-found\)/u);
  });
});

describe('createListsClient.addItem', () => {
  it('flattens the list id alongside the body', async () => {
    const seen: unknown[] = [];
    const client = createListsClient(() =>
      stubHandle({
        add: async (input) => {
          seen.push(input);
          return ok({ id: 9, position: 2 });
        },
      })
    );

    await expect(client.addItem(7, { label: 'Milk', qty: 1, unit: 'L' })).resolves.toBeUndefined();
    expect(seen).toEqual([{ listId: 7, label: 'Milk', qty: 1, unit: 'L' }]);
  });

  it('aborts when the item was not written', async () => {
    const client = createListsClient(() =>
      stubHandle({ add: async () => ({ kind: 'unavailable', pillar: 'lists' }) })
    );

    await expect(client.addItem(7, { label: 'Milk' })).rejects.toBeInstanceOf(ListsCallError);
  });
});

describe('createListsClient.searchShoppingListIdsByNotes', () => {
  it('filters to shopping lists and returns distinct ids in ascending order', async () => {
    const seen: unknown[] = [];
    const client = createListsClient(() =>
      stubHandle({
        search: async (input) => {
          seen.push(input);
          return ok({ items: [{ listId: 9 }, { listId: 2 }, { listId: 9 }] });
        },
      })
    );

    await expect(client.searchShoppingListIdsByNotes('recipe:12')).resolves.toEqual([2, 9]);
    expect(seen).toEqual([{ kind: 'shopping', notesContains: 'recipe:12' }]);
  });

  it('aborts rather than reporting "nothing already sent" when lists cannot answer', async () => {
    const client = createListsClient(() =>
      stubHandle({ search: async () => ({ kind: 'unavailable', pillar: 'lists' }) })
    );

    await expect(client.searchShoppingListIdsByNotes('recipe:12')).rejects.toBeInstanceOf(
      ListsCallError
    );
  });
});
