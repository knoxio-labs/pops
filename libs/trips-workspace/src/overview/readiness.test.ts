import { describe, expect, it } from 'vitest';

import { projectTripRoute } from '../route/projection';
import { routeRead } from '../route/test-utils';
import { sourcePlaces, sourceStay, sourceVisits } from '../stay/test-utils';
import { tripReadiness } from './readiness';

describe('Trip overview overnight readiness', () => {
  const visit = sourceVisits[0]!;

  it('counts only proven missing nights and keeps undated stops out of that total', () => {
    const datedRead = routeRead({
      order: [
        { kind: 'visit', id: visit.id },
        { kind: 'gap', id: 8 },
      ],
    });
    const dated = projectTripRoute(
      { route: datedRead, missingSources: datedRead.missingSources },
      { visits: [visit] }
    );
    const readiness = tripReadiness(
      dated,
      { visits: [visit], places: sourcePlaces, stays: [], events: [] },
      {
        tripId: visit.tripId,
        locale: 'en-AU',
        sourceLabel: (kind, id) => `${kind} #${id}`,
        coverageComplete: true,
      }
    );
    expect(readiness).toMatchObject({ openNights: 8, routeGaps: [8], undatedStops: 0 });

    const undatedVisit = { ...visit, timing: {} };
    const undatedRead = routeRead({ order: [{ kind: 'visit', id: visit.id }] });
    const undatedRoute = projectTripRoute(
      { route: undatedRead, missingSources: undatedRead.missingSources },
      { visits: [undatedVisit] }
    );
    const undated = tripReadiness(
      undatedRoute,
      { visits: [undatedVisit], places: sourcePlaces, stays: [], events: [] },
      {
        tripId: visit.tripId,
        locale: 'en-AU',
        sourceLabel: (kind, id) => `${kind} #${id}`,
        coverageComplete: true,
      }
    );
    expect(undated).toMatchObject({ openNights: 0, undatedStops: 1 });
  });

  it('uses the shared confirmed-status policy and marks partial source reads unknown', () => {
    const read = routeRead({ order: [{ kind: 'visit', id: visit.id }] });
    const projection = projectTripRoute(
      { route: read, missingSources: read.missingSources },
      { visits: [visit] }
    );
    const stay = sourceStay({
      timing: { arrival: visit.timing.arrival, departure: visit.timing.departure },
    });
    const covered = tripReadiness(
      projection,
      { visits: [visit], places: sourcePlaces, stays: [stay], events: [] },
      {
        tripId: visit.tripId,
        locale: 'en-AU',
        sourceLabel: (kind, id) => `${kind} #${id}`,
        coverageComplete: true,
      }
    );
    expect(covered).toMatchObject({ openNights: 0, coveredStops: 1 });

    const incomplete = tripReadiness(
      projection,
      { visits: [visit], places: sourcePlaces, stays: [], events: [] },
      {
        tripId: visit.tripId,
        locale: 'en-AU',
        sourceLabel: (kind, id) => `${kind} #${id}`,
        coverageComplete: false,
      }
    );
    expect(incomplete).toMatchObject({ openNights: 0, unverifiedStops: 1, coveredStops: 0 });
  });
});
