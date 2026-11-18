import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  BookingCommitResultSchema,
  BookingDecisionSchema,
} from '../../contract/booking-import-values.js';
import {
  BookingExtractionAttemptSchema,
  BookingImportSnapshotSchema,
  BookingSourceBindingSchema,
} from '../../contract/booking-imports.js';
import { bookingExtraction, bookingFixture } from '../../db/__tests__/booking-import-test-utils.js';
import { listJourneys } from '../../db/services/journeys.js';
import { getJourneyLegSet } from '../../db/services/leg-set.js';
import { readSourceWorkspace } from '../../db/services/source-queries.js';
import { withBookingApi } from './booking-import-api-test-utils.js';

import type { BookingReviewedTarget } from '../../contract/booking-import-values.js';
import type { PreparedBookingExtraction } from '../../db/services/booking-import-extract.js';

describe('Booking import HTTP Journey lifecycle', () => {
  it('preserves reviewed connections through every route without redispatching or duplicating bookings', async () => {
    const dispatch = vi.fn<PreparedBookingExtraction['dispatch']>(async () => [
      { kind: 'journey', facts: {} },
    ]);
    await withBookingApi(async ({ db, post, get }) => {
      const fixture = bookingFixture(db);
      const base = `/trips/${fixture.tripId}/booking-imports`;
      const bound = await post(base, fixture.bindInput, 'trips.bookingImports.bind');
      expect(bound.status).toBe(200);
      const binding = BookingSourceBindingSchema.parse(await bound.json());
      const sourcePath = `${base}/${binding.sourceId}`;
      const initial = await get(sourcePath, 'trips.bookingImports.get');
      expect(initial.status).toBe(200);
      const before = BookingImportSnapshotSchema.parse(await initial.json());
      const extraction = {
        operationId: randomUUID(),
        bindingId: binding.id,
        expectedSourceRevision: before.source.revision,
        predecessorId: null,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
      };
      const extracted = await post(
        `${sourcePath}/extract`,
        extraction,
        'trips.bookingImports.extract'
      );
      expect(extracted.status).toBe(200);
      const attempt = BookingExtractionAttemptSchema.parse(await extracted.json());
      expect(attempt.state).toBe('succeeded');
      const repeated = await post(
        `${sourcePath}/extract`,
        extraction,
        'trips.bookingImports.extract'
      );
      expect(repeated.status).toBe(200);
      expect(BookingExtractionAttemptSchema.parse(await repeated.json())).toEqual(attempt);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
        representation: 'stored-text-json-v1',
        text: fixture.capture.originalText,
      });
      expect(listJourneys(db, fixture.tripId)).toEqual([]);
      const currentResponse = await get(sourcePath, 'trips.bookingImports.get');
      expect(currentResponse.status).toBe(200);
      const current = BookingImportSnapshotSchema.parse(await currentResponse.json());
      const target = {
        mode: 'createJourney',
        input: { name: 'Reviewed connection' },
        legs: [
          {
            mode: 'Flight',
            from: { sourceLabel: 'Source airport A', date: '2028-01-06' },
            to: { sourceLabel: 'Source airport B' },
          },
          {
            mode: 'Flight',
            from: {
              sourceLabel: 'Source airport B',
              local: '2028-01-07T09:10',
              timeZone: 'Europe/London',
            },
            to: { sourceLabel: 'Source airport C' },
          },
        ],
      } satisfies BookingReviewedTarget;
      const review = {
        operationId: randomUUID(),
        bindingId: binding.id,
        attemptId: attempt.id,
        expectedSourceRevision: current.source.revision,
        expectedCaptureRevision: fixture.capture.revision,
        admission: 'initial',
        decisions: [{ proposalIds: attempt.proposals.map((proposal) => proposal.id), target }],
      };
      const reviewed = await post(`${sourcePath}/review`, review, 'trips.bookingImports.review');
      expect(reviewed.status).toBe(200);
      const body: unknown = await reviewed.json();
      if (typeof body !== 'object' || body === null || !('decisions' in body))
        throw new Error('Expected decisions');
      const decisions = BookingDecisionSchema.array().parse(body.decisions);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]?.target).toEqual(target);
      expect(listJourneys(db, fixture.tripId)).toEqual([]);
      const commit = {
        operationId: randomUUID(),
        decisionIds: decisions.map((decision) => decision.id),
      };
      const committed = await post(`${sourcePath}/commit`, commit, 'trips.bookingImports.commit');
      expect(committed.status).toBe(200);
      const result = BookingCommitResultSchema.parse(await committed.json());
      const proof = result.results[0]?.receipt.journeyLegSets?.[0];
      if (proof === undefined) throw new Error('Expected canonical Journey leg proof');
      expect(proof.legs).toHaveLength(2);
      expect(proof.legs[0]?.from).toEqual(target.legs[0]?.from);
      expect(proof.legs[1]?.from).toEqual(target.legs[1]?.from);
      expect(proof.legs[1]?.to).toEqual({ sourceLabel: 'Source airport C' });
      expect(getJourneyLegSet(db, fixture.tripId, proof.journeyId)).toEqual({
        revision: proof.revision,
        legs: proof.legs,
      });
      const workspace = readSourceWorkspace(db, fixture.tripId);
      expect(workspace.captures[0]?.originalText).toBe(fixture.capture.originalText);
      expect(workspace.associations).toMatchObject([
        { captureId: fixture.capture.id, provenance: 'created' },
      ]);
      for (const operationId of [commit.operationId, randomUUID()]) {
        const replay = await post(
          `${sourcePath}/commit`,
          { ...commit, operationId },
          'trips.bookingImports.commit'
        );
        expect(replay.status).toBe(200);
        const resolved = BookingCommitResultSchema.parse(await replay.json());
        expect(resolved.kind).toBe(
          operationId === commit.operationId ? 'committed' : 'alreadyCommitted'
        );
        expect(resolved.results[0]?.receipt).toEqual(result.results[0]?.receipt);
        expect(readSourceWorkspace(db, fixture.tripId)).toEqual(workspace);
      }
      const snapshotResponse = await get(sourcePath, 'trips.bookingImports.get');
      expect(snapshotResponse.status).toBe(200);
      const snapshot = BookingImportSnapshotSchema.parse(await snapshotResponse.json());
      expect(snapshot.accepted).toHaveLength(1);
      expect(snapshot.accepted[0]?.result.receipt).toEqual(result.results[0]?.receipt);
      expect(listJourneys(db, fixture.tripId)).toHaveLength(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
    }, bookingExtraction(dispatch));
  });
});
