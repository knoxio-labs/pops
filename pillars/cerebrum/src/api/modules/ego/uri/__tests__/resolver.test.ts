import { describe, expect, it, vi } from 'vitest';

import { defaultUriResolvers } from '../index.js';
import { ObjectUriResolver, readPath, type UriTypeResolver } from '../resolver.js';

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

describe('ObjectUriResolver', () => {
  it('resolves a finance transaction with the gateway tool and formatted subtitle', async () => {
    const caller = makeCaller(
      success({ data: { description: 'Coffee', date: '2026-09-14', amount: -42.5 } })
    );
    const resolver = new ObjectUriResolver(caller, defaultUriResolvers);
    const uri = 'pops:finance/transaction/tx_1';

    await expect(resolver.resolve(uri)).resolves.toEqual({
      uri,
      title: 'Coffee',
      subtitle: '2026-09-14 · -42.50',
    });
    expect(caller.callTool).toHaveBeenCalledWith('finance.transactions.get', { id: 'tx_1' });
  });

  it('resolves a budget and omits a null period subtitle', async () => {
    const caller = makeCaller(success({ data: { category: 'Groceries', period: null } }));
    const resolver = new ObjectUriResolver(caller, defaultUriResolvers);

    await expect(resolver.resolve('pops:finance/budget/b1')).resolves.toEqual({
      uri: 'pops:finance/budget/b1',
      title: 'Groceries',
    });
    expect(caller.callTool).toHaveBeenCalledWith('finance.budgets.get', { id: 'b1' });
  });

  it('resolves an engram using its title and type', async () => {
    const caller = makeCaller(
      success({ engram: { title: 'Trip notes', type: 'event' }, body: 'ignored' })
    );
    const resolver = new ObjectUriResolver(caller, defaultUriResolvers);
    const uri = 'pops:cerebrum/engram/eng_1';

    await expect(resolver.resolve(uri)).resolves.toEqual({
      uri,
      title: 'Trip notes',
      subtitle: 'event',
    });
    expect(caller.callTool).toHaveBeenCalledWith('cerebrum.engrams.get', { id: 'eng_1' });
  });

  it('returns null without calling the gateway for malformed or unregistered URIs', async () => {
    const caller = makeCaller(success({}));
    const resolver = new ObjectUriResolver(caller, defaultUriResolvers);
    const uris = [
      'pops:finance/transaction',
      'pops:Finance/transaction/1',
      'finance/transaction/1',
      'pops:finance/transaction/',
      'pops:finance/wishlist-item/1',
    ];

    for (const uri of uris) await expect(resolver.resolve(uri)).resolves.toBeNull();
    expect(caller.callTool).not.toHaveBeenCalled();
  });

  it('returns null when a type resolver rejects an id before dispatch', async () => {
    const caller = makeCaller(success({}));
    const resolverWithInvalidId: UriTypeResolver = {
      key: 'test/thing',
      tool: 'test.thing.get',
      args: () => null,
      describe: () => null,
    };

    await expect(
      new ObjectUriResolver(caller, [resolverWithInvalidId]).resolve('pops:test/thing/1')
    ).resolves.toBeNull();
    expect(caller.callTool).not.toHaveBeenCalled();
  });

  it('returns null when a type resolver cannot describe the gateway payload', async () => {
    const caller = makeCaller(success({}));
    const resolverWithoutDescription: UriTypeResolver = {
      key: 'test/thing',
      tool: 'test.thing.get',
      args: (id) => ({ id }),
      describe: () => null,
    };

    await expect(
      new ObjectUriResolver(caller, [resolverWithoutDescription]).resolve('pops:test/thing/1')
    ).resolves.toBeNull();
    expect(caller.callTool).toHaveBeenCalledWith('test.thing.get', { id: '1' });
  });

  it('returns null for gateway errors, rejected calls, and non-JSON text', async () => {
    const uri = 'pops:finance/transaction/tx_1';
    const failed = new ObjectUriResolver(
      makeCaller({ text: '{"message":"unavailable"}', isError: true }),
      defaultUriResolvers
    );
    const rejectedCaller = makeCaller(success({}));
    rejectedCaller.callTool.mockRejectedValue(new Error('offline'));
    const rejected = new ObjectUriResolver(rejectedCaller, defaultUriResolvers);
    const invalidJson = new ObjectUriResolver(
      makeCaller({ text: 'not-json', isError: false }),
      defaultUriResolvers
    );

    await expect(failed.resolve(uri)).resolves.toBeNull();
    await expect(rejected.resolve(uri)).resolves.toBeNull();
    await expect(invalidJson.resolve(uri)).resolves.toBeNull();
  });

  it('returns null when the title is absent or empty', async () => {
    for (const data of [{}, { description: '' }]) {
      const resolver = new ObjectUriResolver(makeCaller(success({ data })), defaultUriResolvers);
      await expect(resolver.resolve('pops:finance/transaction/tx_1')).resolves.toBeNull();
    }
  });

  it('reads nested plain-object paths and stops at arrays or primitives', () => {
    expect(readPath({ data: { title: 'value' } }, 'data', 'title')).toBe('value');
    expect(readPath({ data: [] }, 'data', 'title')).toBeUndefined();
    expect(readPath({ data: null }, 'data', 'title')).toBeUndefined();
  });
});
