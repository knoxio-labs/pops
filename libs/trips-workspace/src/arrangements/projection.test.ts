import { describe, expect, it } from 'vitest';

import { sourceEvent } from '../event/test-utils';
import { sourceJourney, sourceLeg } from '../journey/test-utils';
import { sourcePlaces, sourceStay, sourceVisits } from '../stay/test-utils';
import { arrangementRows, filterArrangements, groupArrangements, purchased } from './projection';

import type { ArrangementSources, Rental } from './types';

const rental: Rental = {
  id: 61,
  tripId: 7,
  provider: 'Harbour cars',
  pickupVisitId: 31,
  returnVisitId: 32,
  start: '2029-05-01',
  end: '2029-05-09',
  status: 'Reserved',
  revision: 0,
  createdAt: '2029-01-01T00:00:00Z',
  updatedAt: '2029-01-01T00:00:00Z',
};
function sources(): ArrangementSources {
  return {
    visits: [sourceVisits[0]!, { ...sourceVisits[0]!, id: 32 }],
    places: sourcePlaces,
    stays: [sourceStay(), sourceStay({ id: 14, visitId: 32 })],
    events: [sourceEvent()],
    rentals: [rental],
    journeys: [sourceJourney()],
    legs: new Map([[20, [sourceLeg({ from: { placeId: 51, sourceLabel: 'Wellington' } })]]]),
  };
}
describe('Arrangement source projection', () => {
  it('groups actual ordered visit occurrences and emits one rental only at its pickup', () => {
    const source = sources();
    const groups = groupArrangements(arrangementRows(source), source.visits?.toReversed());
    expect(groups.map((group) => group.id)).toEqual(['visit:32', 'visit:31', 'journeys']);
    expect(groups[0]?.rows.map((row) => row.source.id)).toEqual([14]);
    expect(groups[1]?.rows.map((row) => row.source.id)).toEqual([13, 19, 61]);
    expect(
      groups.flatMap((group) => group.rows).filter((row) => row.kind === 'rental')
    ).toHaveLength(1);
    expect(groups[2]?.rows[0]?.source.id).toBe(20);
    expect(source.rentals?.[0]).toBe(rental);
  });
  it('retains unavailable and unassociated memberships separately without matching places or dates', () => {
    const source = sources();
    source.stays = [sourceStay({ visitId: 999 }), sourceStay({ id: 15, visitId: null })];
    source.events = [sourceEvent({ visitId: 998 })];
    source.rentals = [{ ...rental, pickupVisitId: null }];
    const groups = groupArrangements(arrangementRows(source), source.visits);
    expect(groups.find((group) => group.id === 'visit:999')?.unavailableVisitId).toBe(999);
    expect(groups.find((group) => group.id === 'visit:998')?.rows[0]?.source.id).toBe(19);
    expect(
      groups.find((group) => group.id === 'visit:unset')?.rows.map((row) => row.source.id)
    ).toEqual([15, 61]);
    expect(groups.find((group) => group.id === 'journeys')?.rows[0]?.kind).toBe('journey');
    expect(groups.find((group) => group.id === 'visit:31')?.rows).toEqual([]);
  });
  it('searches source facts and keeps purchase distinct from reservations and independent leg axes', () => {
    const source = sources();
    source.stays?.push(sourceStay({ id: 16, status: 'Purchased', name: 'São guesthouse' }));
    source.legs = new Map([[20, [sourceLeg({ purchase: 'Purchased' }), sourceLeg({ id: 41 })]]]);
    const rows = arrangementRows(source);
    expect(
      filterArrangements(rows, { query: 'sao', kind: '', purchase: '' }, source).map(
        (row) => row.source.id
      )
    ).toEqual([16]);
    expect(
      filterArrangements(rows, { query: '', kind: '', purchase: 'purchased' }, source).map(
        (row) => row.source.id
      )
    ).toEqual([16, 20]);
    expect(
      filterArrangements(rows, { query: '', kind: 'journey', purchase: 'not-purchased' }, source)
    ).toHaveLength(1);
    expect(rows.filter(purchased).map((row) => row.source.id)).toEqual([16]);
    expect(rows.find((row) => row.kind === 'rental')?.source.status).toBe('Reserved');
  });
  it('does not claim absence or non-purchase for unavailable leg context', () => {
    const source = sources();
    source.legs = new Map();
    const rows = arrangementRows(source);
    expect(
      filterArrangements(rows, { query: '', kind: 'journey', purchase: '' }, source)
    ).toHaveLength(1);
    expect(
      filterArrangements(rows, { query: '', kind: 'journey', purchase: 'not-purchased' }, source)
    ).toEqual([]);
  });
});
