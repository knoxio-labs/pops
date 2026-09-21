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

function lookupFake(entities: readonly { id: string; name: string; aliases?: string[] }[]): {
  factory: PillarHandleFactory;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const factory: PillarHandleFactory = <TRouter>() =>
    fakePillarHandle<TRouter>('contacts', {
      entities: {
        lookup: (input: unknown) => {
          calls.push(input);
          return Promise.resolve({ kind: 'ok', value: { entities } });
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

  it('filters the producer’s whole match set down to the requested ids only', async () => {
    const { factory } = lookupFake([
      { id: 'ent-1', name: 'Kmart' },
      { id: 'ent-2', name: 'Woolworths' },
      { id: 'ent-3', name: 'Coles' },
    ]);

    const outcome = await clientOver(factory).lookupEntities(['ent-2']);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value).toEqual(new Map([['ent-2', 'Woolworths']]));
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
