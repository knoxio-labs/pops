import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { events } from '../schema.js';
import { createEvent } from '../services/events.js';
import { createJourneyLeg } from '../services/journey-legs.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { createRental } from '../services/rentals.js';
import { previewRouteDraftDeletion } from '../services/route-draft-preview.js';
import { createStay } from '../services/stays.js';
import { draftCandidate, draftState } from './route-draft-test-utils.js';
import { withRouteFixture } from './route-test-utils.js';

import type { JourneyLegInput } from '../../contract/journey-schemas.js';
import type { RentalInput } from '../../contract/rental-schemas.js';
import type { StayInput } from '../../contract/stay-schemas.js';

const stayStates: { status: StayInput['status']; confirmed: boolean }[] = [
  { status: null, confirmed: false },
  { status: 'Considering', confirmed: false },
  { status: 'Agreed', confirmed: true },
  { status: 'Reserved', confirmed: true },
  { status: 'Purchased', confirmed: true },
];

it.each(stayStates)(
  'classifies Stay status $status independently of its name, reference and timing',
  ({ status, confirmed }) => {
    withRouteFixture((fixture) => {
      const { db, trip, first, gap, path } = fixture;
      const stay = createStay(db, trip.id, {
        visitId: first.id,
        status,
        name: 'Booked',
        reference: 'Paid',
        timing: { arrival: '2028-03-10' },
      });
      const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
      const selection = [
        { kind: 'visit', id: first.id },
        { kind: 'stay', id: stay.id },
      ] as const;
      const before = draftState(fixture);
      const preview = previewRouteDraftDeletion(db, trip.id, draft.id, {
        deleteSources: [...selection],
      });
      expect(draftCandidate(preview, { kind: 'stay', id: stay.id })).toMatchObject({
        confirmed,
        disposition: confirmed ? 'retain' : 'remove',
        facts: [{ field: 'status', value: status }],
      });
      expect(draftCandidate(preview, { kind: 'visit', id: first.id })).toMatchObject({
        confirmed: false,
        disposition: confirmed ? 'retain' : 'remove',
      });
      expect(draftState(fixture)).toEqual(before);
    });
  }
);

const rentalStates: { status: RentalInput['status']; confirmed: boolean }[] = [
  { status: null, confirmed: false },
  { status: 'Considering', confirmed: false },
  { status: 'Reserved', confirmed: true },
  { status: 'Purchased', confirmed: true },
];

it.each(rentalStates)(
  'classifies Rental status $status without inventing a booking from dates',
  ({ status, confirmed }) => {
    withRouteFixture(({ db, trip, first, gap, path }) => {
      const rental = createRental(db, trip.id, {
        pickupVisitId: first.id,
        returnVisitId: first.id,
        status,
        start: '2028-03-10',
        provider: 'Reserved',
      });
      const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
      const preview = previewRouteDraftDeletion(db, trip.id, draft.id, {
        deleteSources: [
          { kind: 'visit', id: first.id },
          { kind: 'rental', id: rental.id },
        ],
      });
      expect(draftCandidate(preview, { kind: 'rental', id: rental.id })).toMatchObject({
        confirmed,
        disposition: confirmed ? 'retain' : 'remove',
      });
    });
  }
);

const intentions: JourneyLegInput['intention'][] = [null, 'In plan', 'Considering', 'Alternative'];
const arrangements: { value: JourneyLegInput['arrangement']; confirmed: boolean }[] = [
  { value: null, confirmed: false },
  { value: 'Not arranged', confirmed: false },
  { value: 'Not needed', confirmed: false },
  { value: 'Agreed', confirmed: true },
  { value: 'Booked', confirmed: true },
];
const purchases: JourneyLegInput['purchase'][] = [null, 'Purchased'];

for (const intention of intentions) {
  for (const arrangement of arrangements) {
    for (const purchase of purchases) {
      it(`keeps Event and Journey-leg axes independent: ${intention}/${arrangement.value}/${purchase}`, () => {
        withRouteFixture(({ db, trip, first, journey, gap, path }) => {
          const input = {
            intention,
            arrangement: arrangement.value,
            purchase,
            reference: 'Booked and paid',
          };
          const event = createEvent(db, trip.id, { ...input, visitId: first.id });
          const leg = createJourneyLeg(db, trip.id, journey.id, input);
          const draft = path(gap().id, [
            { kind: 'visit', id: first.id },
            { kind: 'journey', id: journey.id },
          ]);
          const preview = previewRouteDraftDeletion(db, trip.id, draft.id, {
            deleteSources: [
              { kind: 'visit', id: first.id },
              { kind: 'journey', id: journey.id },
              { kind: 'event', id: event.id },
              { kind: 'journey-leg', journeyId: journey.id, id: leg.id },
            ],
          });
          const confirmed = arrangement.confirmed || purchase === 'Purchased';
          for (const source of [
            { kind: 'event', id: event.id },
            { kind: 'journey-leg', journeyId: journey.id, id: leg.id },
          ] as const) {
            expect(draftCandidate(preview, source)).toMatchObject({
              confirmed,
              disposition: confirmed ? 'retain' : 'remove',
            });
          }
          expect(draftCandidate(preview, { kind: 'visit', id: first.id }).disposition).toBe(
            confirmed ? 'retain' : 'remove'
          );
          expect(draftCandidate(preview, { kind: 'journey', id: journey.id }).disposition).toBe(
            confirmed ? 'retain' : 'remove'
          );
        });
      });
    }
  }
}

for (const intention of ['Considering', 'Planned'] as const) {
  for (const agreement of ['Not agreed', 'Agreed'] as const) {
    it(`classifies Meeting agreement independently of intention: ${intention}/${agreement}`, () => {
      withRouteFixture(({ db, trip, first, gap, path }) => {
        const contactUri = 'pops:contacts/contact/test-person';
        const meeting = operateMeetingPlan(
          db,
          trip.id,
          {
            operationId: randomUUID(),
            command: {
              kind: 'create',
              input: { contactUri, visitId: first.id, intention, agreement },
            },
          },
          contactUri
        ).current;
        const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
        const preview = previewRouteDraftDeletion(db, trip.id, draft.id, {
          deleteSources: [
            { kind: 'visit', id: first.id },
            { kind: 'meeting', id: meeting.id },
          ],
        });
        expect(draftCandidate(preview, { kind: 'meeting', id: meeting.id })).toMatchObject({
          confirmed: agreement === 'Agreed',
          disposition: agreement === 'Agreed' ? 'retain' : 'remove',
        });
      });
    });
  }
}

it('fails closed on malformed persisted axes rather than treating them as unconfirmed', () => {
  withRouteFixture(({ db, trip, first, gap, path }) => {
    const event = createEvent(db, trip.id, { visitId: first.id });
    const draft = path(gap().id, [{ kind: 'visit', id: first.id }]);
    db.update(events)
      .set({ arrangement: sql`${'Purchased'}` })
      .where(eq(events.id, event.id))
      .run();
    expect(() => previewRouteDraftDeletion(db, trip.id, draft.id, {})).toThrow(
      'route_draft_conflict'
    );
  });
});
