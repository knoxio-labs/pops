import { describe, expect, it } from 'vitest';

/**
 * `MobileContactsClient.lookupEntities`, at the seam between the gateway and
 * `purchases`' merchant-identity mapping.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createPillarGateway, isGatewayOk } from '../../pillars/gateway.js';
import { createMobileContactsClient } from '../client.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../../pillars/gateway.js';

function clientOver(factory: PillarHandleFactory) {
  return createMobileContactsClient(createPillarGateway(factory));
}

/**
 * A stand-in for `contacts`' own `entities.lookup`, including its `ids`
 * filter (POPS-3925): an absent/undefined `ids` answers the whole set, a
 * present one narrows it — the same contract the real route now serves, so
 * these tests exercise bfm trusting that filter rather than re-filtering the
 * response itself.
 */
function lookupFake(entities: readonly { id: string; name: string; aliases?: string[] }[]): {
  factory: PillarHandleFactory;
  calls: { ids?: string[] }[];
} {
  const calls: { ids?: string[] }[] = [];
  const factory: PillarHandleFactory = <TRouter>() =>
    fakePillarHandle<TRouter>('contacts', {
      entities: {
        lookup: (raw: unknown) => {
          const input = raw as { ids?: string[] };
          calls.push(input);
          const filtered =
            input.ids === undefined
              ? entities
              : entities.filter((entity) => input.ids?.includes(entity.id));
          return Promise.resolve({ kind: 'ok', value: { entities: filtered } });
        },
      },
    });
  return { factory, calls };
}

describe('lookupEntities', () => {
  it('makes no call at all for an empty id list', async () => {
    const { factory, calls } = lookupFake([{ id: 'ent-1', name: 'Kmart' }]);

    const outcome = await clientOver(factory).lookupEntities([]);

    expect(outcome).toEqual({ kind: 'ok', value: new Map() });
    expect(calls).toHaveLength(0);
  });

  it('resolves the requested ids in one call, dropping ids nothing matched', async () => {
    const { factory, calls } = lookupFake([
      { id: 'ent-1', name: 'Kmart', aliases: ['K mart'] },
      { id: 'ent-2', name: 'Woolworths' },
    ]);

    const outcome = await clientOver(factory).lookupEntities(['ent-1', 'ent-2', 'ent-missing']);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value).toEqual(
      new Map([
        ['ent-1', 'Kmart'],
        ['ent-2', 'Woolworths'],
      ])
    );
    expect(calls).toHaveLength(1);
  });

  it('asks the producer to filter by exactly the requested ids, rather than fetching everything', async () => {
    const { factory, calls } = lookupFake([
      { id: 'ent-1', name: 'Kmart' },
      { id: 'ent-2', name: 'Woolworths' },
      { id: 'ent-3', name: 'Coles' },
    ]);

    const outcome = await clientOver(factory).lookupEntities(['ent-2']);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value).toEqual(new Map([['ent-2', 'Woolworths']]));
    expect(calls).toEqual([{ ids: ['ent-2'] }]);
  });

  it('reports a gateway failure without inventing names', async () => {
    const failure: CallResult<unknown> = { kind: 'unavailable', pillar: 'contacts' };
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: { lookup: () => Promise.resolve(failure) },
      });

    const outcome = await clientOver(factory).lookupEntities(['ent-1']);

    expect(isGatewayOk(outcome)).toBe(false);
  });

  it('reports a contract mismatch rather than a malformed map', async () => {
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: { lookup: () => Promise.resolve({ kind: 'ok', value: { nope: true } }) },
      });

    const outcome = await clientOver(factory).lookupEntities(['ent-1']);

    expect(outcome.kind).toBe('contract-mismatch');
  });
});

describe('searchMerchants', () => {
  it('passes the query and limit through and reads the producer’s data array', async () => {
    const calls: unknown[] = [];
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: {
          list: (input: unknown) => {
            calls.push(input);
            return Promise.resolve({
              kind: 'ok',
              value: { data: [{ id: 'e1', name: 'Bunnings Warehouse' }] },
            });
          },
        },
      });

    const outcome = await clientOver(factory).searchMerchants('bunnings', 25);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value).toEqual([{ id: 'e1', name: 'Bunnings Warehouse' }]);
    expect(calls).toEqual([{ search: 'bunnings', limit: 25 }]);
  });

  it('reports a contract mismatch rather than an empty result on a malformed shape', async () => {
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: { list: () => Promise.resolve({ kind: 'ok', value: { nope: true } }) },
      });

    const outcome = await clientOver(factory).searchMerchants('anything');

    expect(outcome.kind).toBe('contract-mismatch');
  });
});

describe('getMerchant', () => {
  it('answers the producer’s entity', async () => {
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: {
          get: () => Promise.resolve({ kind: 'ok', value: { data: { id: 'e1', name: 'Acme' } } }),
        },
      });

    const outcome = await clientOver(factory).getMerchant('e1');

    expect(outcome).toEqual({ kind: 'ok', value: { id: 'e1', name: 'Acme' } });
  });

  it('reports a not-found rather than a crash', async () => {
    const failure: CallResult<unknown> = { kind: 'not-found', pillar: 'contacts', message: 'nope' };
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: { get: () => Promise.resolve(failure) },
      });

    const outcome = await clientOver(factory).getMerchant('unknown');

    expect(outcome.kind).toBe('not-found');
  });
});

describe('createMerchant', () => {
  it('creates and answers the new entity', async () => {
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: {
          create: () =>
            Promise.resolve({ kind: 'ok', value: { data: { id: 'e2', name: 'New Merchant' } } }),
        },
      });

    const outcome = await clientOver(factory).createMerchant('New Merchant');

    expect(outcome).toEqual({ kind: 'ok', value: { id: 'e2', name: 'New Merchant' } });
  });

  it('resolves a double-tap name conflict to the entity that already owns the name, not an error', async () => {
    const createCalls: unknown[] = [];
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: {
          create: (input: unknown) => {
            createCalls.push(input);
            const failure: CallResult<unknown> = {
              kind: 'conflict',
              pillar: 'contacts',
              message: "Entity with name 'Acme' already exists",
            };
            return Promise.resolve(failure);
          },
          list: () =>
            Promise.resolve({ kind: 'ok', value: { data: [{ id: 'e1', name: 'Acme' }] } }),
        },
      });

    const first = await clientOver(factory).createMerchant('Acme');
    const second = await clientOver(factory).createMerchant('Acme');

    expect(first).toEqual({ kind: 'ok', value: { id: 'e1', name: 'Acme' } });
    expect(second).toEqual({ kind: 'ok', value: { id: 'e1', name: 'Acme' } });
    expect(createCalls).toHaveLength(2);
  });

  it('surfaces the conflict unchanged when the retried search does not find the name either', async () => {
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('contacts', {
        entities: {
          create: () => {
            const failure: CallResult<unknown> = {
              kind: 'conflict',
              pillar: 'contacts',
              message: 'conflict',
            };
            return Promise.resolve(failure);
          },
          list: () => Promise.resolve({ kind: 'ok', value: { data: [] } }),
        },
      });

    const outcome = await clientOver(factory).createMerchant('Ghost Merchant');

    expect(outcome.kind).toBe('conflict');
  });
});
