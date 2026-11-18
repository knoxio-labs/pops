import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  commitBookingSource,
  getBookingImport,
  reviewBookingSource,
} from '../services/booking-imports.js';
import { createJourneyLeg } from '../services/journey-legs.js';
import { listJourneys } from '../services/journeys.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import { listVisits } from '../services/records.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import { listStays } from '../services/stays.js';
import { preparedBooking, withBookingDb } from './booking-import-test-utils.js';
import { send } from './capture-test-utils.js';

import type { BookingReviewedTarget } from '../../contract/booking-import-values.js';

const reviewedJourney = {
  mode: 'createJourney',
  input: { name: 'Reviewed connection', reference: 'FICTIONAL' },
  legs: [
    {
      mode: 'Flight',
      service: 'FA101',
      from: { sourceLabel: 'Source airport A', date: '2028-01-06' },
      to: { sourceLabel: 'Source airport B', local: '2028-01-07T06:35', timeZone: 'Europe/London' },
    },
    {
      mode: 'Flight',
      service: 'FA202',
      from: { sourceLabel: 'Source airport B', local: '2028-01-07T09:10' },
      to: { sourceLabel: 'Source airport C' },
    },
  ],
} satisfies BookingReviewedTarget;

describe('Reviewed booking Journey persistence', () => {
  it('commits exact ordered legs once, retains the original and undoes only the created journey', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db, [reviewedJourney]);
      const reviewed = reviewBookingSource(
        db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      expect(reviewed.decisions[0]?.target).toEqual(reviewedJourney);
      expect(listJourneys(db, fixture.tripId)).toEqual([]);
      const input = {
        operationId: randomUUID(),
        decisionIds: reviewed.decisions.map((decision) => decision.id),
      };
      const committed = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, input);
      const child = committed.results[0];
      const proof = child?.receipt.journeyLegSets?.[0];
      if (child === undefined || proof === undefined)
        throw new Error('Expected canonical leg proof');
      const firstLeg = proof.legs[0];
      const secondLeg = proof.legs[1];
      if (firstLeg === undefined || secondLeg === undefined)
        throw new Error('Expected both reviewed Journey legs');
      expect(listJourneys(db, fixture.tripId)).toMatchObject([
        { name: 'Reviewed connection', reference: 'FICTIONAL' },
      ]);
      expect(proof.legs).toHaveLength(2);
      expect(firstLeg).toMatchObject({
        mode: 'Flight',
        service: 'FA101',
        from: { sourceLabel: 'Source airport A', date: '2028-01-06' },
        to: {
          sourceLabel: 'Source airport B',
          local: '2028-01-07T06:35',
          timeZone: 'Europe/London',
        },
      });
      expect(secondLeg).toMatchObject({
        mode: 'Flight',
        service: 'FA202',
        from: {
          sourceLabel: 'Source airport B',
          local: '2028-01-07T09:10',
        },
        to: { sourceLabel: 'Source airport C' },
      });
      expect(firstLeg.from).toEqual({ sourceLabel: 'Source airport A', date: '2028-01-06' });
      expect(secondLeg.to).toEqual({ sourceLabel: 'Source airport C' });
      expect(getJourneyLegSet(db, fixture.tripId, proof.journeyId)).toEqual({
        revision: proof.revision,
        legs: proof.legs,
      });
      const workspace = readSourceWorkspace(db, fixture.tripId);
      expect(workspace.captures[0]?.originalText).toBe(fixture.capture.originalText);
      expect(workspace.associations).toMatchObject([
        { captureId: fixture.capture.id, provenance: 'created' },
      ]);
      expect(listVisits(db, fixture.tripId)).toEqual([]);
      const resolved = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
        ...input,
        operationId: randomUUID(),
      });
      expect(resolved).toMatchObject({
        kind: 'alreadyCommitted',
        originalOperationId: input.operationId,
      });
      expect(resolved.results[0]?.receipt).toEqual(child.receipt);
      expect(readSourceWorkspace(db, fixture.tripId)).toEqual(workspace);
      expect(
        commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, input).results[0]?.receipt
      ).toEqual(child.receipt);
      send(db, fixture.tripId, { kind: 'undo', targetOperationId: child.receipt.operationId });
      expect(listJourneys(db, fixture.tripId)).toEqual([]);
      const replay = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, input);
      expect(replay.results[0]).toMatchObject({
        receipt: child.receipt,
        undone: true,
        current: { journeys: [], journeyLegSets: [] },
      });
      expect(readSourceWorkspace(db, fixture.tripId).captures[0]?.originalText).toBe(
        fixture.capture.originalText
      );
      expect(
        getBookingImport(db, fixture.tripId, fixture.binding.sourceId).decisions[0]?.target
      ).toEqual(reviewedJourney);
    }));

  it('rolls back earlier bookings and every leg when a later leg names an absent place', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db, [
        { mode: 'createStay', input: { name: 'Must roll back' } },
        {
          mode: 'createJourney',
          input: {},
          legs: [{ from: { date: '2028-01-06' } }, { to: { placeId: 999999 } }],
        },
      ]);
      const reviewed = reviewBookingSource(
        db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      const before = readSourceWorkspace(db, fixture.tripId);
      const importBefore = getBookingImport(db, fixture.tripId, fixture.binding.sourceId);
      expect(() =>
        commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
          operationId: randomUUID(),
          decisionIds: reviewed.decisions.map((decision) => decision.id),
        })
      ).toThrow('not_found');
      expect(listStays(db, fixture.tripId)).toEqual([]);
      expect(listJourneys(db, fixture.tripId)).toEqual([]);
      expect(readSourceWorkspace(db, fixture.tripId)).toEqual(before);
      expect(getBookingImport(db, fixture.tripId, fixture.binding.sourceId)).toEqual(importBefore);
    }));

  it('refuses to undo a reviewed Journey after its legs have been edited', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db, [reviewedJourney]);
      const reviewed = reviewBookingSource(
        db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      const committed = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
        operationId: randomUUID(),
        decisionIds: reviewed.decisions.map((decision) => decision.id),
      });
      const operation = committed.results[0];
      const proof = operation?.receipt.journeyLegSets?.[0];
      if (operation === undefined || proof === undefined)
        throw new Error('Expected canonical leg proof');
      createJourneyLeg(db, fixture.tripId, proof.journeyId, { mode: 'Ground transport' });
      const edited = getJourneyLegSet(db, fixture.tripId, proof.journeyId);

      expect(() =>
        send(db, fixture.tripId, { kind: 'undo', targetOperationId: operation.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(getJourneyLegSet(db, fixture.tripId, proof.journeyId)).toEqual(edited);
      expect(listJourneys(db, fixture.tripId)).toHaveLength(1);
      expect(readSourceWorkspace(db, fixture.tripId).associations).toHaveLength(1);
    }));
});
