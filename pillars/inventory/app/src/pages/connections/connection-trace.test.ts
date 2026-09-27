import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { connectionRows } from './connection-model.js';
import { traceChain } from './connection-trace.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';

function rawItem(id: string, name = id): WebConnectionRow['item'] {
  return {
    code: null,
    id,
    isContainer: false,
    kind: 'item',
    lifecycle: 'active',
    name,
    typeKey: null,
  };
}

function modelItem(id: string, name = id): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'in-hand' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function itemRow(id: string, source: string, far: string): WebConnectionRow {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    far: rawItem(far),
    id,
    item: rawItem(source),
  };
}

function fixtureRow(id: string, source: string): WebConnectionRow {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    far: {
      id: 'fixture-1',
      kind: 'fixture',
      locationId: 'room-1',
      name: 'Outlet',
      type: 'power',
    },
    id,
    item: rawItem(source),
  };
}

function resolvedRows() {
  const rawRows = [
    itemRow('edge-ab', 'item-a', 'item-b'),
    itemRow('edge-bc', 'item-b', 'item-c'),
    fixtureRow('edge-cf', 'item-c'),
    itemRow('edge-ad', 'item-a', 'item-d'),
  ];
  const world = buildWorld(
    ['item-a', 'item-b', 'item-c', 'item-d'].map((id) => modelItem(id)),
    []
  );
  return { rows: connectionRows(rawRows, world), world };
}

describe('traceChain', () => {
  it('walks item edges breadth-first and leaves fixtures at the edge', () => {
    const { rows, world } = resolvedRows();
    const trace = traceChain('item-a', rows, world);

    expect(trace?.root.end.kind).toBe('item');
    expect(
      trace?.root.children.map((node) => (node.end.kind === 'item' ? node.end.item.id : ''))
    ).toEqual(['item-b', 'item-d']);
    const itemB = trace?.root.children[0];
    if (itemB === undefined) throw new Error('Expected item-b in the trace');
    expect(
      itemB.children.map((node) => (node.end.kind === 'item' ? node.end.item.id : ''))
    ).toEqual(['item-c']);
    const itemC = itemB.children[0];
    if (itemC === undefined) throw new Error('Expected item-c in the trace');
    expect(itemC.children[0]?.end.kind).toBe('fixture');
    expect(trace?.items).toBe(3);
    expect(trace?.fixtures).toBe(1);
  });

  it('does not repeat nodes when item connections form a cycle', () => {
    const rawRows = [
      itemRow('edge-ab', 'item-a', 'item-b'),
      itemRow('edge-bc', 'item-b', 'item-c'),
      itemRow('edge-ca', 'item-c', 'item-a'),
    ];
    const world = buildWorld(
      ['item-a', 'item-b', 'item-c'].map((id) => modelItem(id)),
      []
    );
    const trace = traceChain('item-a', connectionRows(rawRows, world), world);

    expect(
      trace?.root.children.map((node) => (node.end.kind === 'item' ? node.end.item.id : ''))
    ).toEqual(['item-b', 'item-c']);
    expect(trace?.root.children.flatMap((node) => node.children)).toEqual([]);
  });

  it('returns an empty chain for an unconnected item and null for an unknown item', () => {
    const world = buildWorld([modelItem('item-a'), modelItem('unconnected')], []);
    const rows = connectionRows([itemRow('edge-ab', 'item-a', 'item-b')], world);

    expect(traceChain('unconnected', rows, world)).toEqual({
      root: {
        key: 'item:unconnected',
        end: { kind: 'item', item: modelItem('unconnected') },
        depth: 0,
        children: [],
      },
      items: 0,
      fixtures: 0,
    });
    expect(traceChain('missing', rows, world)).toBeNull();
  });
});
