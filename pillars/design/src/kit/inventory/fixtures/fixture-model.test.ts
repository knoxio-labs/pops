import { coreWorld } from '@/fixtures/inventory/core';
import { houseConnections, houseFixtures } from '@/fixtures/inventory/fixtures-house';
import { describe, expect, it } from 'vitest';

import {
  NO_FIXTURE_FILTER,
  filterFixtures,
  fixtureRows,
  isFiltered,
  wiredItems,
} from './fixture-model';

import type { ConnectionModel } from './fixture-model';

const rows = fixtureRows(houseFixtures, houseConnections, coreWorld);

describe('wiredItems', () => {
  it('lists each wired item once, in name order', () => {
    const doubled: ConnectionModel[] = [
      ...houseConnections,
      {
        id: 'dup',
        itemId: 'itm-tv',
        to: { kind: 'fixture', fixtureId: 'fx-tv-outlet' },
        createdAt: '',
      },
    ];
    expect(wiredItems('fx-tv-outlet', doubled, coreWorld).map((item) => item.name)).toEqual([
      'Game console',
      'Soundbar',
      'Television',
    ]);
  });

  it('ignores item to item edges and ids the world does not know', () => {
    const stray: ConnectionModel[] = [
      {
        id: 's1',
        itemId: 'itm-gone',
        to: { kind: 'fixture', fixtureId: 'fx-hall-switch' },
        createdAt: '',
      },
      { id: 's2', itemId: 'itm-tv', to: { kind: 'item', itemId: 'fx-hall-switch' }, createdAt: '' },
    ];
    expect(wiredItems('fx-hall-switch', stray, coreWorld)).toEqual([]);
  });
});

describe('fixtureRows', () => {
  it('sorts by room name, then fixture name', () => {
    const kitchen = rows.filter((row) => row.fixture.locationId === 'loc-kitchen');
    expect(kitchen.map((row) => row.fixture.name)).toEqual([
      'Bench outlet by the window',
      'Pendant lights over the bench',
    ]);
    expect(rows[0]?.fixture.locationId).toBe('loc-garage');
  });
});

describe('filterFixtures', () => {
  it('passes everything through with no filter', () => {
    expect(filterFixtures(rows, NO_FIXTURE_FILTER, coreWorld)).toHaveLength(houseFixtures.length);
    expect(isFiltered(NO_FIXTURE_FILTER)).toBe(false);
  });

  it('keeps one kind', () => {
    const lights = filterFixtures(rows, { ...NO_FIXTURE_FILTER, kind: 'light' }, coreWorld);
    expect(lights.map((row) => row.fixture.id).toSorted()).toEqual([
      'fx-living-light',
      'fx-pendants',
    ]);
  });

  it('keeps a location and everything beneath it', () => {
    const garage = filterFixtures(
      rows,
      { ...NO_FIXTURE_FILTER, locationId: 'loc-garage' },
      coreWorld
    );
    expect(garage.map((row) => row.fixture.id).toSorted()).toEqual([
      'fx-laundry-tap',
      'fx-workbench-outlet',
    ]);
  });

  it('matches the query against names, notes and wired items', () => {
    const byItem = filterFixtures(rows, { ...NO_FIXTURE_FILTER, query: 'toaster' }, coreWorld);
    expect(byItem.map((row) => row.fixture.id)).toEqual(['fx-bench-outlet']);
    const byNote = filterFixtures(rows, { ...NO_FIXTURE_FILTER, query: 'PORT 4' }, coreWorld);
    expect(byNote.map((row) => row.fixture.id)).toEqual(['fx-study-port']);
  });

  it('treats a whitespace query as no filter', () => {
    const spaced = { ...NO_FIXTURE_FILTER, query: '   ' };
    expect(isFiltered(spaced)).toBe(false);
    expect(filterFixtures(rows, spaced, coreWorld)).toHaveLength(houseFixtures.length);
  });
});
