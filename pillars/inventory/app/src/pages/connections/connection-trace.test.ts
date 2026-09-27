import { describe, expect, it } from 'vitest';

import { connectionTrace } from './connection-trace.js';

import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';

function item(id: string, name = id): WebConnectionRow['item'] {
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

function itemRow(id: string, source: string, far: string): WebConnectionRow {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    far: item(far),
    id,
    item: item(source),
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
    item: item(source),
  };
}

describe('connectionTrace', () => {
  it('walks item edges breadth-first and leaves fixtures at the edge', () => {
    const trace = connectionTrace(
      [
        itemRow('edge-ab', 'item-a', 'item-b'),
        itemRow('edge-bc', 'item-b', 'item-c'),
        fixtureRow('edge-cf', 'item-c'),
        itemRow('edge-ad', 'item-a', 'item-d'),
      ],
      'item-a'
    );

    expect(trace?.root.end.id).toBe('item-a');
    expect(trace?.root.children.map((node) => node.end.id)).toEqual(['item-b', 'item-d']);
    expect(trace?.root.children[0]?.children.map((node) => node.end.id)).toEqual(['item-c']);
    expect(trace?.root.children[0]?.children[0]?.children.map((node) => node.end.id)).toEqual([
      'fixture-1',
    ]);
    expect(trace?.root.children[0]?.children[0]?.children[0]?.children).toEqual([]);
  });

  it('does not repeat nodes when item connections form a cycle', () => {
    const trace = connectionTrace(
      [
        itemRow('edge-ab', 'item-a', 'item-b'),
        itemRow('edge-bc', 'item-b', 'item-c'),
        itemRow('edge-ca', 'item-c', 'item-a'),
      ],
      'item-a'
    );

    expect(trace?.root.children.map((node) => node.end.id)).toEqual(['item-b', 'item-c']);
    expect(trace?.root.children.flatMap((node) => node.children)).toEqual([]);
  });

  it('returns null when the requested item is absent', () => {
    expect(connectionTrace([itemRow('edge-ab', 'item-a', 'item-b')], 'missing')).toBeNull();
  });
});
