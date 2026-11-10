import { describe, expect, it } from 'vitest';

import { sourceJourney } from '../journey/test-utils';
import { sourceVisits } from '../stay/test-utils';
import { projectTripRoute } from './projection';
import { routeRead } from './test-utils';

describe('explicit mixed route projection', () => {
  it('preserves persisted root/path order, repeated cities and applied history without source inference', () => {
    const visit = sourceVisits[0];
    if (!visit) throw new Error('Missing fixture');
    const read = routeRead({
      order: [
        { kind: 'visit', id: 32 },
        { kind: 'gap', id: 4 },
        { kind: 'journey', id: 20 },
        { kind: 'visit', id: 31 },
      ],
      paths: [
        {
          id: 9,
          title: 'Later',
          gapId: 4,
          state: 'alternative',
          members: [{ kind: 'visit', id: 33 }],
        },
        {
          id: 8,
          title: 'Earlier',
          gapId: 4,
          state: 'applied',
          members: [{ kind: 'journey', id: 20 }],
        },
      ],
    });
    const visits = [
      visit,
      { ...visit, id: 33 },
      { ...visit, id: 32 },
      { ...visit, id: 35 },
      { ...visit, id: 34 },
    ];
    const result = projectTripRoute(
      { route: read, missingSources: [] },
      { visits, journeys: [sourceJourney(), sourceJourney({ id: 21 })] }
    );
    expect(result.order.map((row) => row.reference)).toEqual(read.order);
    expect(result.paths.map((row) => row.path.id)).toEqual([9, 8]);
    expect(result.paths.map((row) => row.members.map((member) => member.reference))).toEqual(
      read.paths.map((path) => path.members)
    );
    expect(result.unplaced.visits.map((row) => row.id)).toEqual([35, 34]);
    expect(result.unplaced.journeys.map((row) => row.id)).toEqual([21]);
    expect(visits[0]).toBe(visit);
  });
  it('distinguishes producer missing from unavailable context and rejects foreign-trip same-ID records', () => {
    const visit = sourceVisits[0];
    if (!visit) throw new Error('Missing fixture');
    const read = routeRead({
      order: [
        { kind: 'visit', id: 31 },
        { kind: 'journey', id: 20 },
      ],
    });
    const context = { visits: [{ ...visit, tripId: 8 }], journeys: [sourceJourney({ tripId: 8 })] };
    expect(
      projectTripRoute({ route: read, missingSources: undefined }, context).order.map(
        (row) => row.state
      )
    ).toEqual(['unavailable', 'unavailable']);
    expect(
      projectTripRoute({ route: read, missingSources: [{ kind: 'visit', id: 31 }] }, {}).order.map(
        (row) => row.state
      )
    ).toEqual(['missing', 'unavailable']);
    expect(
      projectTripRoute({ route: read, missingSources: [] }, {}).order.map((row) => row.state)
    ).toEqual(['unavailable', 'unavailable']);
  });
});
