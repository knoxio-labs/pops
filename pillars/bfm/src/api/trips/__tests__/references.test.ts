import { describe, expect, it } from 'vitest';

import { tripsFixture } from './fixtures.js';
import { tripsClientOver } from './gateway.js';

import type { MobileTripDetail } from '../../../contract/mobile-trips-detail-schemas.js';

const corruptions: { name: string; change: (detail: MobileTripDetail) => void }[] = [
  {
    name: 'missing visit place',
    change: (d) => {
      d.places = d.places.filter((p) => p.id !== 11);
    },
  },
  {
    name: 'missing endpoint place',
    change: (d) => {
      d.places = d.places.filter((p) => p.id !== 12);
    },
  },
  {
    name: 'duplicate place identity',
    change: (d) => {
      const place = d.places.at(0);
      if (place) d.places.push(place);
    },
  },
  {
    name: 'wrong trip identity',
    change: (d) => {
      d.trip.id = 8;
    },
  },
  {
    name: 'wrong visit owner',
    change: (d) => {
      const visit = d.visits.at(0);
      if (visit) visit.tripId = 8;
    },
  },
  {
    name: 'missing stay visit',
    change: (d) => {
      const stay = d.stays.at(0);
      if (stay) stay.visitId = 999;
    },
  },
  {
    name: 'missing selected journey',
    change: (d) => {
      const group = d.journeyGroups.at(0);
      if (group) group.currentJourneyId = 999;
    },
  },
  {
    name: 'wrong leg owner',
    change: (d) => {
      const leg = d.journeys.at(0)?.legs.at(0);
      if (leg) leg.journeyId = 41;
    },
  },
  {
    name: 'duplicate leg identity',
    change: (d) => {
      const leg = d.journeys.at(0)?.legs.at(0);
      const other = d.journeys.at(1)?.legs.at(0);
      if (leg && other) other.id = leg.id;
    },
  },
];

describe('Trips source reference consistency', () => {
  it.each(corruptions)('fails a complete aggregate with $name', async ({ change }) => {
    const detail = tripsFixture();
    change(detail);
    expect(await tripsClientOver(detail).client.getTrip(7)).toMatchObject({
      kind: 'contract-mismatch',
      status: 502,
    });
  });
});
