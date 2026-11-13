import type { MobileTripRoute } from '../../../contract/mobile-trip-route-schemas.js';

/** Fictional canonical placement with independent Visit occurrences, missing source and applied history. */
export function tripRouteFixture(): MobileTripRoute {
  return {
    tripId: 7,
    revision: 12,
    order: [
      { kind: 'visit', id: 22 },
      { kind: 'journey', id: 40 },
      { kind: 'gap', id: 71 },
      { kind: 'visit', id: 21 },
    ],
    paths: [
      {
        id: 72,
        title: 'A separate path',
        gapId: 71,
        state: 'alternative',
        members: [
          { kind: 'journey', id: 41 },
          { kind: 'visit', id: 24 },
        ],
      },
      {
        id: 73,
        title: 'Applied history',
        gapId: 71,
        state: 'applied',
        members: [
          { kind: 'visit', id: 22 },
          { kind: 'journey', id: 40 },
        ],
      },
    ],
    missingSources: [{ kind: 'visit', id: 24 }],
  };
}
