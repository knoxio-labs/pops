import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import {
  connectionEndKey,
  connectionGraph,
  connectionRows,
  connectionRoom,
  endKey,
} from './connection-model.js';

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

function modelItem(id: string, name: string, locationId: string | null = null): ItemRowModel {
  return {
    id,
    name,
    typeId: 'device',
    typeName: 'Device',
    code: `${id}-code`,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: locationId === null ? { kind: 'in-hand' } : { kind: 'location', locationId },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function connection(
  id: string,
  source: WebConnectionRow['item'],
  far: WebConnectionRow['far']
): WebConnectionRow {
  return { createdAt: '2026-09-01T00:00:00.000Z', far, id, item: source };
}

describe('connectionRows', () => {
  it('resolves both item ends, preserves server order, and drops missing item ends', () => {
    const rows = [
      connection('edge-2', item('item-a', 'A'), item('item-b', 'B')),
      connection('edge-1', item('item-a', 'A'), {
        id: 'fixture-1',
        kind: 'fixture',
        locationId: 'room-1',
        name: 'Outlet',
        type: 'power',
      }),
      connection('edge-missing', item('item-a', 'A'), item('missing', 'Missing')),
    ];
    const world = buildWorld([modelItem('item-a', 'A'), modelItem('item-b', 'B')], []);

    expect(connectionRows(rows, world).map((row) => row.id)).toEqual(['edge-2', 'edge-1']);
    expect(connectionRows(rows, world)[1]?.far).toEqual({
      kind: 'fixture',
      fixture: {
        id: 'fixture-1',
        kind: 'power',
        locationId: 'room-1',
        name: 'Outlet',
        type: 'power',
      },
    });
  });
});

describe('connectionGraph', () => {
  it('keeps server row order while deduplicating graph nodes', () => {
    const source = item('item-a', 'A');
    const rows = connectionRows(
      [
        connection('edge-1', source, item('item-b', 'B')),
        connection('edge-2', source, {
          id: 'fixture-1',
          kind: 'fixture',
          locationId: 'room-1',
          name: 'Outlet',
          type: 'power',
        }),
      ],
      buildWorld([modelItem('item-a', 'A'), modelItem('item-b', 'B')], [])
    );

    expect(connectionGraph(rows)).toEqual({
      nodes: [
        { id: 'item:item-a', itemName: 'A', assetId: 'item-a-code', type: 'Device' },
        { id: 'item:item-b', itemName: 'B', assetId: 'item-b-code', type: 'Device' },
        {
          id: 'fixture:fixture-1',
          itemName: 'Outlet',
          assetId: null,
          type: 'Fixture',
          isFixture: true,
        },
      ],
      edges: [
        { source: 'item:item-a', target: 'item:item-b' },
        { source: 'item:item-a', target: 'fixture:fixture-1' },
      ],
    });
  });

  it('keeps item and fixture keys distinct', () => {
    const rows = connectionRows(
      [
        connection('edge-1', item('same-id', 'Item'), {
          id: 'same-id',
          kind: 'fixture',
          locationId: null,
          name: 'Fixture',
          type: 'power',
        }),
      ],
      buildWorld([modelItem('same-id', 'Item')], [])
    );
    const row = rows[0];
    if (row === undefined) throw new Error('Expected a resolved connection');

    expect(endKey({ kind: 'item', item: row.item })).toBe('item:same-id');
    expect(connectionEndKey(row.far)).toBe('fixture:same-id');
  });
});

describe('connectionRoom', () => {
  it('uses the source item effective room before the fixture room', () => {
    const location: LocationModel = {
      id: 'room-1',
      name: 'Study',
      parentId: null,
      kind: 'room',
    };
    const row = connectionRows(
      [
        connection('edge-1', item('item-a', 'A'), {
          id: 'fixture-1',
          kind: 'fixture',
          locationId: 'room-2',
          name: 'Outlet',
          type: 'power',
        }),
      ],
      buildWorld([modelItem('item-a', 'A', 'room-1')], [location])
    )[0];
    if (row === undefined) throw new Error('Expected a resolved connection');

    expect(connectionRoom(row, buildWorld([modelItem('item-a', 'A', 'room-1')], [location]))).toBe(
      'Study'
    );
    expect(connectionRoom(row, buildWorld([modelItem('item-a', 'A')], []))).toBe('In hand');
  });
});
