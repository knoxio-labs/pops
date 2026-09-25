import { coreWorld } from '@/fixtures/inventory/core';
import { houseConnections, houseFixtures } from '@/fixtures/inventory/fixtures-house';
import { describe, expect, it } from 'vitest';

import {
  connectionIndex,
  connectionRows,
  connectRefusal,
  filterConnections,
  registrySummary,
} from './connection-model';
import { registryGraph, traceChain } from './connection-trace';

import type { ConnectionModel } from '@/kit/inventory/fixtures/fixture-model';

const index = connectionIndex(coreWorld, houseFixtures);
const rows = connectionRows(houseConnections, index);

const edge = (id: string, itemId: string, other: string): ConnectionModel => ({
  id,
  itemId,
  to: { kind: 'item', itemId: other },
  createdAt: '2026-09-01T00:00:00.000Z',
});

describe('connectionRows', () => {
  it('resolves every house edge and sorts by item then far end', () => {
    expect(rows).toHaveLength(houseConnections.length);
    const names = rows.map((row) => row.item.name);
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b)));
  });

  it('drops an edge whose far end no longer resolves', () => {
    const broken = [edge('x1', 'itm-tv', 'itm-gone'), edge('x2', 'itm-gone', 'itm-tv')];
    expect(connectionRows(broken, index)).toEqual([]);
  });
});

describe('filterConnections', () => {
  it('keeps only fixture edges for the fixture kind', () => {
    const fixtures = filterConnections(rows, { query: '', kind: 'fixture' });
    expect(fixtures.length).toBe(11);
    expect(fixtures.every((row) => row.far.kind === 'fixture')).toBe(true);
  });

  it('matches a query against either end and codes, ignoring case and padding', () => {
    const byFar = filterConnections(rows, { query: '  SOUNDBAR ', kind: 'item' });
    expect(byFar.map((row) => row.edge.id)).toEqual(['cx-i1']);
    const byCode = filterConnections(rows, { query: 'p01', kind: 'all' });
    expect(byCode.map((row) => row.edge.id).toSorted()).toEqual(['cx-f8', 'cx-i6']);
  });

  it('returns nothing when the query matches no end', () => {
    expect(filterConnections(rows, { query: 'zzz', kind: 'all' })).toEqual([]);
  });
});

describe('registrySummary', () => {
  it('counts distinct items and fixtures, not edges', () => {
    expect(registrySummary(rows)).toEqual({ connections: 17, items: 12, fixtures: 6 });
  });
});

describe('connectRefusal', () => {
  it('allows a new item to item edge', () => {
    expect(
      connectRefusal('itm-lamp', { kind: 'item', itemId: 'itm-desk' }, houseConnections, index)
    ).toBeNull();
  });

  it('refuses an existing edge in either direction', () => {
    const backwards = connectRefusal(
      'itm-soundbar',
      { kind: 'item', itemId: 'itm-tv' },
      houseConnections,
      index
    );
    expect(backwards).toBe('Soundbar and Television are already connected.');
    const fixture = connectRefusal(
      'itm-tv',
      { kind: 'fixture', fixtureId: 'fx-antenna' },
      houseConnections,
      index
    );
    expect(fixture).toBe('Television and TV antenna point are already connected.');
  });

  it('allows the same item to a different fixture', () => {
    expect(
      connectRefusal(
        'itm-tv',
        { kind: 'fixture', fixtureId: 'fx-living-light' },
        houseConnections,
        index
      )
    ).toBeNull();
  });

  it('refuses self, inactive items and unknown ends', () => {
    expect(connectRefusal('itm-tv', { kind: 'item', itemId: 'itm-tv' }, [], index)).toBe(
      'An item cannot connect to itself.'
    );
    expect(connectRefusal('itm-tv', { kind: 'item', itemId: 'itm-camera' }, [], index)).toBe(
      'Film camera is retired. Restore it before connecting it.'
    );
    expect(connectRefusal('itm-tv', { kind: 'fixture', fixtureId: 'fx-none' }, [], index)).toBe(
      'Choose both ends.'
    );
  });
});

describe('traceChain', () => {
  it('walks item edges transitively and stops at fixtures', () => {
    const chain = traceChain('itm-tv', houseConnections, index);
    expect(chain?.items).toBe(4);
    expect(chain?.fixtures).toBe(4);
    expect(chain?.root.children.map((node) => node.key)).toEqual([
      'item:itm-console',
      'item:itm-soundbar',
      'fixture:fx-antenna',
      'fixture:fx-tv-outlet',
    ]);
    const console = chain?.root.children.find((node) => node.key === 'item:itm-console');
    expect(console?.children.map((node) => node.key)).toEqual(['item:itm-router']);
    const outlet = chain?.root.children.find((node) => node.key === 'fixture:fx-tv-outlet');
    expect(outlet?.children).toEqual([]);
  });

  it('visits each node once through a cycle', () => {
    const cycle = [
      edge('a', 'itm-tv', 'itm-soundbar'),
      edge('b', 'itm-soundbar', 'itm-console'),
      edge('c', 'itm-console', 'itm-tv'),
    ];
    const chain = traceChain('itm-tv', cycle, index);
    expect(chain?.items).toBe(2);
    expect(chain?.root.children.map((node) => node.depth)).toEqual([1, 1]);
    expect(chain?.root.children.flatMap((node) => node.children)).toEqual([]);
  });

  it('is null for an unknown item and empty for an unconnected one', () => {
    expect(traceChain('itm-gone', houseConnections, index)).toBeNull();
    expect(traceChain('itm-desk', houseConnections, index)?.root.children).toEqual([]);
  });
});

describe('registryGraph', () => {
  it('draws each end once and marks fixtures by type', () => {
    const graph = registryGraph(houseConnections, index);
    expect(graph.edges).toHaveLength(17);
    expect(graph.nodes).toHaveLength(18);
    expect(graph.nodes.find((node) => node.id === 'fixture:fx-antenna')?.type).toBe('Fixture');
  });
});
