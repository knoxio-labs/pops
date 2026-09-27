import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { connectionEndKey, connectionGraph, connectionRoom } from './connection-model.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';

function item(id: string, name: string): WebConnectionRow['item'] {
  return {
    code: `${id}-code`,
    id,
    isContainer: false,
    kind: 'item',
    lifecycle: 'active',
    name,
    typeKey: 'device',
  };
}

function connection(
  id: string,
  source: WebConnectionRow['item'],
  far: WebConnectionRow['far']
): WebConnectionRow {
  return { createdAt: '2026-09-01T00:00:00.000Z', far, id, item: source };
}

describe('connectionGraph', () => {
  it('keeps server row order while deduplicating graph nodes', () => {
    const source = item('item-a', 'A');
    const rows = [
      connection('edge-1', source, item('item-b', 'B')),
      connection('edge-2', source, {
        id: 'fixture-1',
        kind: 'fixture',
        locationId: 'room-1',
        name: 'Outlet',
        type: 'power',
      }),
    ];

    expect(connectionGraph(rows)).toEqual({
      nodes: [
        { id: 'item-a', itemName: 'A', assetId: 'item-a-code', type: 'device' },
        { id: 'item-b', itemName: 'B', assetId: 'item-b-code', type: 'device' },
        {
          id: 'fixture:fixture-1',
          itemName: 'Outlet',
          assetId: null,
          type: 'power',
          isFixture: true,
        },
      ],
      edges: [
        { source: 'item-a', target: 'item-b' },
        { source: 'item-a', target: 'fixture:fixture-1' },
      ],
    });
  });

  it('uses distinct keys for item and fixture endpoints', () => {
    expect(connectionEndKey(item('same-id', 'Item'))).toBe('same-id');
    expect(
      connectionEndKey({
        id: 'same-id',
        kind: 'fixture',
        locationId: null,
        name: 'Fixture',
        type: 'power',
      })
    ).toBe('fixture:same-id');
  });

  it('resolves the source item effective room for the list row', () => {
    const source: ItemRowModel = {
      id: 'item-a',
      name: 'A',
      typeId: null,
      typeName: null,
      code: null,
      quantity: 1,
      container: null,
      lifecycle: 'active',
      placement: { kind: 'location', locationId: 'room-1' },
      previous: null,
      sync: 'synced',
      photoUrl: null,
      note: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const location: LocationModel = {
      id: 'room-1',
      name: 'Study',
      parentId: null,
      kind: 'room',
    };
    const row = connection('edge-1', item('item-a', 'A'), item('item-b', 'B'));

    expect(connectionRoom(row, buildWorld([source], [location]))).toBe('Study');
  });
});
