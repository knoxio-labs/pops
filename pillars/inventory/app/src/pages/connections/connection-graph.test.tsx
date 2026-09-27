import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { connectionRows } from './connection-model.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';

const mocks = vi.hoisted(() => ({
  useGraphInteraction: vi.fn(),
  useGraphSimulation: vi.fn(),
}));

vi.mock('../../components/connection-graph/useGraphInteraction.js', () => ({
  useGraphInteraction: (...args: unknown[]) => mocks.useGraphInteraction(...args),
}));
vi.mock('../../components/connection-graph/useGraphSimulation.js', () => ({
  useGraphSimulation: (...args: unknown[]) => mocks.useGraphSimulation(...args),
}));

import { ConnectionGraph } from './connection-graph.js';

function item(id: string): WebConnectionRow['item'] {
  return {
    code: null,
    id,
    isContainer: false,
    kind: 'item',
    lifecycle: 'active',
    name: id,
    typeKey: null,
  };
}

const rows: WebConnectionRow[] = [
  {
    createdAt: '2026-09-01T00:00:00.000Z',
    far: item('item-b'),
    id: 'edge-1',
    item: item('item-a'),
  },
  {
    createdAt: '2026-09-02T00:00:00.000Z',
    far: {
      id: 'fixture-1',
      kind: 'fixture',
      locationId: null,
      name: 'Outlet',
      type: 'power',
    },
    id: 'edge-2',
    item: item('item-a'),
  },
];

function modelItem(id: string): ItemRowModel {
  return {
    id,
    name: id,
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

describe('ConnectionGraph', () => {
  it('passes all registry rows to the existing simulation', () => {
    render(
      <MemoryRouter>
        <ConnectionGraph
          rows={connectionRows(rows, buildWorld([modelItem('item-a'), modelItem('item-b')], []))}
          focusItemId="item-a"
        />
      </MemoryRouter>
    );

    const simulationArgs = mocks.useGraphSimulation.mock.calls.at(-1)?.[0];
    expect(simulationArgs).toMatchObject({
      itemId: 'item:item-a',
      rawData: {
        edges: [
          { source: 'item:item-a', target: 'item:item-b' },
          { source: 'item:item-a', target: 'fixture:fixture-1' },
        ],
      },
    });
    expect(simulationArgs).toMatchObject({
      rawData: {
        nodes: [{ id: 'item:item-a' }, { id: 'item:item-b' }, { id: 'fixture:fixture-1' }],
      },
    });
  });
});
