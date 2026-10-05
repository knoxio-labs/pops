import { describe, expect, it, vi } from 'vitest';

import { egoEntityPartSchema } from '../../../../contract/rest-ego-parts.js';
import {
  LocalToolbox,
  MAX_SHOWN_ENTITIES,
  NAVIGATE_TOOL,
  SHOW_ENTITIES_TOOL,
} from '../local-tools.js';

import type { ObjectUriResolver, ResolvedEntity } from '../uri/resolver.js';

function entity(uri: string, title: string, subtitle?: string): ResolvedEntity {
  return { uri, title, ...(subtitle === undefined ? {} : { subtitle }) };
}

function makeResolver(entities: ResolvedEntity[] = []) {
  const byUri = new Map(entities.map((resolved) => [resolved.uri, resolved]));
  const resolve = vi.fn<ObjectUriResolver['resolve']>(async (uri) => byUri.get(uri) ?? null);
  return { resolver: { resolve }, resolve };
}

describe('LocalToolbox', () => {
  it('defines the strict entity-card and navigation tools', async () => {
    const toolbox = new LocalToolbox(makeResolver().resolver);
    const definitions = await toolbox.definitions();

    expect(definitions).toHaveLength(2);
    expect(definitions[0]).toEqual({
      name: SHOW_ENTITIES_TOOL,
      label: SHOW_ENTITIES_TOOL,
      description: expect.stringContaining('only way a card appears'),
      inputSchema: {
        type: 'object',
        properties: {
          uris: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: MAX_SHOWN_ENTITIES,
          },
        },
        required: ['uris'],
        additionalProperties: false,
      },
    });
    expect(definitions[1]).toEqual({
      name: NAVIGATE_TOOL,
      label: NAVIGATE_TOOL,
      description: expect.stringContaining('user asks to go to it'),
      inputSchema: {
        type: 'object',
        properties: { uri: { type: 'string' } },
        required: ['uri'],
        additionalProperties: false,
      },
    });
  });

  it('resolves multiple URIs in parallel and returns entity parts in input order', async () => {
    const firstUri = 'pops:finance/transaction/tx_1';
    const secondUri = 'pops:inventory/item/item_2';
    const pending = new Map<string, (value: ResolvedEntity | null) => void>();
    const resolve = vi.fn<ObjectUriResolver['resolve']>(
      (uri) =>
        new Promise((resolveUri) => {
          pending.set(uri, resolveUri);
        })
    );
    const toolbox = new LocalToolbox({ resolve });
    const resultPromise = toolbox.dispatch(SHOW_ENTITIES_TOOL, { uris: [firstUri, secondUri] });

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenNthCalledWith(1, firstUri);
    expect(resolve).toHaveBeenNthCalledWith(2, secondUri);
    pending.get(secondUri)?.(entity(secondUri, 'Bread'));
    pending.get(firstUri)?.(entity(firstUri, 'Coffee', '2026-10-04 · -4.20'));

    const result = await resultPromise;
    expect(result).toMatchObject({
      kind: 'result',
      isError: false,
      parts: [
        {
          type: 'entity',
          uri: firstUri,
          title: 'Coffee',
          subtitle: '2026-10-04 · -4.20',
        },
        { type: 'entity', uri: secondUri, title: 'Bread' },
      ],
    });
    if (result.kind !== 'result') throw new Error('Expected a result outcome.');
    expect(result.text).toContain('Showed 2 objects.');
    for (const part of result.parts ?? []) {
      expect(egoEntityPartSchema.safeParse(part).success).toBe(true);
    }
  });

  it('includes the unresolved URI while keeping a partial result successful', async () => {
    const foundUri = 'pops:finance/budget/b1';
    const missingUri = 'pops:finance/budget/b2';
    const { resolver } = makeResolver([entity(foundUri, 'Groceries')]);
    const result = await new LocalToolbox(resolver).dispatch(SHOW_ENTITIES_TOOL, {
      uris: [foundUri, missingUri],
    });

    expect(result).toMatchObject({
      kind: 'result',
      isError: false,
      parts: [{ type: 'entity', uri: foundUri, title: 'Groceries' }],
    });
    if (result.kind !== 'result') throw new Error('Expected a result outcome.');
    expect(result.text).toContain('Showed 1 object.');
    expect(result.text).toContain(missingUri);
  });

  it('returns an error and no parts when no URI resolves', async () => {
    const missingUri = 'pops:finance/transaction/missing';
    const { resolver } = makeResolver();
    const result = await new LocalToolbox(resolver).dispatch(SHOW_ENTITIES_TOOL, {
      uris: [missingUri],
    });

    expect(result).toMatchObject({ kind: 'result', isError: true, parts: [] });
    if (result.kind !== 'result') throw new Error('Expected a result outcome.');
    expect(result.text).toContain(missingUri);
  });

  it('collapses duplicate URIs to their first occurrence', async () => {
    const uri = 'pops:cerebrum/engram/eng_1';
    const { resolver, resolve } = makeResolver([entity(uri, 'Trip notes')]);
    const result = await new LocalToolbox(resolver).dispatch(SHOW_ENTITIES_TOOL, {
      uris: [uri, uri],
    });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      kind: 'result',
      isError: false,
      parts: [{ type: 'entity', uri, title: 'Trip notes' }],
    });
  });

  it('rejects invalid URI lists without attempting resolution', async () => {
    const { resolver, resolve } = makeResolver();
    const toolbox = new LocalToolbox(resolver);
    const invalidInputs: unknown[] = [
      [],
      Array.from({ length: MAX_SHOWN_ENTITIES + 1 }, (_, index) => 'pops:test/item/' + index),
      'pops:finance/transaction/tx_1',
      ['pops:finance/transaction/tx_1', 42],
    ];

    for (const uris of invalidInputs) {
      const result = await toolbox.dispatch(SHOW_ENTITIES_TOOL, { uris });
      expect(result).toMatchObject({ kind: 'result', isError: true });
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('navigates only to a URI the resolver resolves', async () => {
    const uri = 'pops:purchases/purchase/order_1';
    const { resolver, resolve } = makeResolver([entity(uri, 'Order 1')]);
    const toolbox = new LocalToolbox(resolver);

    await expect(toolbox.dispatch(NAVIGATE_TOOL, { uri })).resolves.toEqual({
      kind: 'result',
      text: 'Opening Order 1.',
      isError: false,
      navigate: uri,
    });
    await expect(
      toolbox.dispatch(NAVIGATE_TOOL, { uri: 'pops:finance/transaction/missing' })
    ).resolves.toMatchObject({ kind: 'result', isError: true });
    await expect(toolbox.dispatch(NAVIGATE_TOOL, { uri: 12 })).resolves.toMatchObject({
      kind: 'result',
      isError: true,
    });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(
      await toolbox.dispatch(NAVIGATE_TOOL, { uri: 'pops:finance/transaction/missing' })
    ).not.toHaveProperty('navigate');
    expect(await toolbox.dispatch(NAVIGATE_TOOL, { uri: 12 })).not.toHaveProperty('navigate');
  });

  it('returns an error result for an unknown tool name', async () => {
    const toolbox = new LocalToolbox(makeResolver().resolver);

    await expect(toolbox.dispatch('unknown_tool', {})).resolves.toEqual({
      kind: 'result',
      text: 'Unknown tool: unknown_tool',
      isError: true,
    });
  });
});
