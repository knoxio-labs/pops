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

describe('media, account, and location URI resolvers', () => {
  it('resolves a movie title and release year with a numeric gateway id', async () => {
    const caller = makeCaller(success({ data: { title: 'Arrival', releaseDate: '2016-11-11' } }));
    const uri = 'pops:media/movie/3';

    await expect(new ObjectUriResolver(caller, defaultUriResolvers).resolve(uri)).resolves.toEqual({
      uri,
      title: 'Arrival',
      subtitle: '2016',
    });
    expect(caller.callTool).toHaveBeenCalledWith('media.movies.get', { id: 3 });
  });

  it('rejects invalid media ids without calling the gateway', async () => {
    const caller = makeCaller(success({ data: { title: 'Arrival' } }));
    const resolver = new ObjectUriResolver(caller, defaultUriResolvers);

    await expect(resolver.resolve('pops:media/movie/abc')).resolves.toBeNull();
    await expect(resolver.resolve('pops:media/movie/0')).resolves.toBeNull();
    expect(caller.callTool).not.toHaveBeenCalled();
  });

  it('resolves a TV show and omits a subtitle when its first air date is null', async () => {
    const caller = makeCaller(success({ data: { name: 'Severance', firstAirDate: null } }));
    const uri = 'pops:media/tv-show/8';

    await expect(new ObjectUriResolver(caller, defaultUriResolvers).resolve(uri)).resolves.toEqual({
      uri,
      title: 'Severance',
    });
    expect(caller.callTool).toHaveBeenCalledWith('media.tvShows.get', { id: 8 });
  });

  it('resolves a finance account with its kind and currency subtitle', async () => {
    const caller = makeCaller(
      success({ data: { name: 'Everyday', kind: 'credit', currency: 'AUD' } })
    );
    const uri = 'pops:finance/account/account_1';

    await expect(new ObjectUriResolver(caller, defaultUriResolvers).resolve(uri)).resolves.toEqual({
      uri,
      title: 'Everyday',
      subtitle: 'credit · AUD',
    });
    expect(caller.callTool).toHaveBeenCalledWith('finance.accounts.get', { id: 'account_1' });
  });

  it('resolves an inventory location without a subtitle', async () => {
    const caller = makeCaller(success({ data: { name: 'Home' } }));
    const uri = 'pops:inventory/location/location_1';

    await expect(new ObjectUriResolver(caller, defaultUriResolvers).resolve(uri)).resolves.toEqual({
      uri,
      title: 'Home',
    });
    expect(caller.callTool).toHaveBeenCalledWith('inventory.locations.get', {
      id: 'location_1',
    });
  });

  it('registers exactly the nine gateway object URI types with no duplicates', () => {
    const keys = defaultUriResolvers.map(({ key }) => key);
    const expected = [
      'finance/transaction',
      'finance/account',
      'finance/budget',
      'media/movie',
      'media/tv-show',
      'inventory/item',
      'inventory/location',
      'purchases/purchase',
      'cerebrum/engram',
    ];

    expect(keys.toSorted()).toEqual(expected.toSorted());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
