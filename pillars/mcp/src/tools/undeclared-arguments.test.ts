import { describe, expect, it } from 'vitest';

import { allTools } from './index.js';
import { undeclaredArguments, undeclaredArgumentsMessage } from './undeclared-arguments.js';

import type { ToolDef } from './tool-def.js';

function tool(name: string): ToolDef {
  const found = allTools.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}

describe('undeclaredArguments', () => {
  it('names a misspelt container filter on inventory.items.list', () => {
    const list = tool('inventory.items.list');
    expect(undeclaredArguments(list.inputSchema, { containerItemId: 'box', limit: 200 })).toEqual([
      'containerItemId',
    ]);
  });

  it('accepts the declared container filter on inventory.items.list', () => {
    const list = tool('inventory.items.list');
    expect(undeclaredArguments(list.inputSchema, { containingItemId: 'box', limit: 200 })).toEqual(
      []
    );
  });

  it('names every undeclared key, not just the first', () => {
    const schema: ToolDef['inputSchema'] = {
      type: 'object',
      additionalProperties: false,
      properties: { a: { type: 'string' } },
    };
    expect(undeclaredArguments(schema, { a: '1', b: '2', c: '3' })).toEqual(['b', 'c']);
  });

  it('treats a closed schema with no properties as accepting nothing', () => {
    const schema: ToolDef['inputSchema'] = { type: 'object', additionalProperties: false };
    expect(undeclaredArguments(schema, { anything: true })).toEqual(['anything']);
  });

  it('leaves a schema that does not close its properties alone', () => {
    const open: ToolDef['inputSchema'] = { type: 'object', properties: { a: { type: 'string' } } };
    expect(undeclaredArguments(open, { b: '2' })).toEqual([]);
    expect(undeclaredArguments({ ...open, additionalProperties: true }, { b: '2' })).toEqual([]);
  });
});

describe('undeclaredArgumentsMessage', () => {
  it('lists the accepted names so the caller can correct itself', () => {
    expect(
      undeclaredArgumentsMessage(tool('inventory.items.list'), ['containerItemId'])
    ).toMatchInlineSnapshot(
      `"Unknown argument(s) for inventory.items.list: containerItemId. Accepted: cursor, limit, typeKey, placementKind, locationId, containingItemId, includeInactive."`
    );
  });
});
