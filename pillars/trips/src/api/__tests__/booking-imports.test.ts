import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { BookingCommitResultSchema } from '../../contract/booking-import-values.js';
import {
  BookingImportSnapshotSchema,
  BookingSourceBindingSchema,
} from '../../contract/booking-imports.js';
import { preparedBooking } from '../../db/__tests__/booking-import-test-utils.js';
import { getBookingImport, reviewBookingSource } from '../../db/services/booking-imports.js';
import { withBookingApi } from './booking-import-api-test-utils.js';

describe('Booking import HTTP authority and canonical proof', () => {
  it('requires each projected scope and distinguishes absent extraction from unknown dispatch', () =>
    withBookingApi(async ({ db, post: requestPost, get: requestGet }) => {
      const fixture = await preparedBooking(db);
      const base = `/trips/${fixture.tripId}/booking-imports`;
      const post = (path: string, body: unknown, scope: string | null) =>
        requestPost(`${base}${path}`, body, scope);
      expect((await post('', fixture.bindInput, null)).status).toBe(401);
      expect((await post('', fixture.bindInput, 'trips.bookingImports.get')).status).toBe(403);
      const bind = await post('', fixture.bindInput, 'trips.bookingImports.bind');
      expect(bind.status).toBe(200);
      expect(BookingSourceBindingSchema.parse(await bind.json())).toEqual(fixture.binding);
      expect(
        (
          await post(
            '',
            { ...fixture.bindInput, sha256: 'caller-proof' },
            'trips.bookingImports.bind'
          )
        ).status
      ).toBe(400);
      const extract = await post(
        `/${fixture.binding.sourceId}/extract`,
        {
          operationId: randomUUID(),
          bindingId: fixture.binding.id,
          expectedSourceRevision: 1,
          predecessorId: fixture.attempt.id,
          providerId: 'fictional-provider',
          modelId: 'fictional-model',
        },
        'trips.bookingImports.extract'
      );
      expect(extract.status).toBe(503);
      expect(await extract.json()).toMatchObject({
        code: 'trips.booking_import.booking_import_unavailable',
        retryable: false,
      });
      const get = await requestGet(
        `${base}/${fixture.binding.sourceId}`,
        'trips.bookingImports.get'
      );
      expect(get.status).toBe(200);
      expect(BookingImportSnapshotSchema.parse(await get.json()).attempts).toHaveLength(1);
      expect((await requestGet(`${base}/${randomUUID()}`, 'trips.bookingImports.get')).status).toBe(
        404
      );
      const mismatch = await post(
        '',
        {
          ...fixture.bindInput,
          selection: { ...fixture.bindInput.selection, expectedCaptureRevision: 20 },
        },
        'trips.bookingImports.bind'
      );
      expect(mismatch.status).toBe(409);
      const review = reviewBookingSource(
        db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      const input = {
        operationId: randomUUID(),
        decisionIds: review.decisions.map((decision) => decision.id),
      };
      expect(
        (await post(`/${fixture.binding.sourceId}/commit`, input, 'trips.bookingImports.review'))
          .status
      ).toBe(403);
      const committed = await post(
        `/${fixture.binding.sourceId}/commit`,
        input,
        'trips.bookingImports.commit'
      );
      expect(committed.status).toBe(200);
      const first = BookingCommitResultSchema.parse(await committed.json());
      expect(first).toMatchObject({ kind: 'committed', operationId: input.operationId });
      const resolved = await post(
        `/${fixture.binding.sourceId}/commit`,
        { ...input, operationId: randomUUID() },
        'trips.bookingImports.commit'
      );
      expect(resolved.status).toBe(200);
      expect(BookingCommitResultSchema.parse(await resolved.json())).toMatchObject({
        kind: 'alreadyCommitted',
        originalOperationId: input.operationId,
      });
      expect(
        (
          await post(
            `/${fixture.binding.sourceId}/commit`,
            { ...input, decisionIds: [] },
            'trips.bookingImports.commit'
          )
        ).status
      ).toBe(400);
    }));

  it.each(['bind', 'extract', 'review', 'commit', 'get'])(
    'refuses unauthenticated and unrelated-scope %s requests before changing the source',
    (operation) =>
      withBookingApi(async ({ db, post, get }) => {
        const fixture = await preparedBooking(db);
        const base = `/trips/${fixture.tripId}/booking-imports`;
        const sourcePath = `${base}/${fixture.binding.sourceId}`;
        const before = getBookingImport(db, fixture.tripId, fixture.binding.sourceId);
        for (const scope of [null, 'trips.journeys.list']) {
          const response =
            operation === 'get'
              ? await get(sourcePath, scope)
              : await post(operation === 'bind' ? base : `${sourcePath}/${operation}`, {}, scope);
          expect(response.status).toBe(scope === null ? 401 : 403);
          expect(getBookingImport(db, fixture.tripId, fixture.binding.sourceId)).toEqual(before);
        }
      })
  );
});
