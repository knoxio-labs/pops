import { describe, expect, it } from 'vitest';

import {
  fixtureRoomName,
  fixtureRoomPath,
  isFixtureFiltered,
  wiredSummary,
} from './fixture-model.js';

import type { LocationModel } from '../../foundation/model/model.js';
import type { FixtureListRow } from './fixture-model.js';

function row(overrides: Partial<FixtureListRow> = {}): FixtureListRow {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    id: 'fixture-1',
    lastEditedTime: '2026-09-01T00:00:00.000Z',
    locationId: 'room-1',
    name: 'Desk outlet',
    notes: null,
    type: 'power',
    wiredCount: 3,
    wiredNames: ['Lamp', 'Monitor', 'Dock'],
    ...overrides,
  };
}

const locations: LocationModel[] = [
  { id: 'home', name: 'Home', parentId: null, kind: 'property' },
  { id: 'room-1', name: 'Office', parentId: 'home', kind: 'room' },
];

describe('fixture display model', () => {
  it('uses the server wired count and names for the compact summary', () => {
    expect(wiredSummary(row())).toBe('Lamp, Monitor and 1 more');
    expect(wiredSummary(row({ wiredCount: 2, wiredNames: ['Lamp', 'Monitor', 'Ignored'] }))).toBe(
      'Lamp, Monitor'
    );
    expect(wiredSummary(row({ wiredCount: 0, wiredNames: ['Stale name'] }))).toBe('Nothing wired');
  });

  it('resolves room names and ancestor paths without inventing a location', () => {
    const byId = new Map(locations.map((location) => [location.id, location] as const));

    expect(fixtureRoomName(byId, 'room-1')).toBe('Office');
    expect(fixtureRoomName(byId, 'missing')).toBe('Unknown place');
    expect(fixtureRoomName(byId, null)).toBe('No room assigned');
    expect(fixtureRoomPath(byId, 'room-1')).toBe('Home / Office');
  });

  it('only treats a non-empty query or kind as a narrowed result', () => {
    expect(isFixtureFiltered({ q: '   ', kind: null })).toBe(false);
    expect(isFixtureFiltered({ q: '', kind: 'power' })).toBe(true);
  });
});
