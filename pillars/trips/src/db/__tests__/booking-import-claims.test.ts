import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { bookingImportRequests } from '../schema.js';
import {
  bindBookingSource,
  extractBookingSource,
  getBookingImport,
} from '../services/booking-imports.js';
import {
  bookingExtraction,
  bookingFixture,
  preparedBooking,
  withBookingDb,
} from './booking-import-test-utils.js';

describe('Booking one-shot extraction claims', () => {
  it('retains unknown outcomes and never repeats the same UUID outbound invocation', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const binding = await bindBookingSource(db, fixture.tripId, fixture.bindInput, {});
      const input = {
        operationId: randomUUID(),
        bindingId: binding.id,
        expectedSourceRevision: 0,
        predecessorId: null,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
      };
      const extract = vi.fn(async (): Promise<never> => {
        throw new Error('Provider connection lost after dispatch');
      });
      const prepare = vi.fn(async () => ({ dispatch: extract }));
      const attempt = await extractBookingSource(db, fixture.tripId, binding.sourceId, {
        ...input,
        dependencies: { prepare },
      });
      expect(attempt.state).toBe('outcome_unknown');
      const replayPrepare = vi.fn(async () => {
        throw new Error('Replay must bypass preparation');
      });
      expect(
        await extractBookingSource(db, fixture.tripId, binding.sourceId, {
          ...input,
          dependencies: { prepare: replayPrepare },
        })
      ).toEqual(attempt);
      expect(replayPrepare).not.toHaveBeenCalled();
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(extract).toHaveBeenCalledTimes(1);
      expect(getBookingImport(db, fixture.tripId, binding.sourceId).attempts).toEqual([attempt]);
    }));

  it('does not create a durable attempt or receipt when admission refuses before dispatch', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const binding = await bindBookingSource(db, fixture.tripId, fixture.bindInput);
      const before = getBookingImport(db, fixture.tripId, binding.sourceId);
      const requestsBefore = db.select().from(bookingImportRequests).all();
      const prepare = vi.fn(async () => {
        throw new Error('Configured privacy admission refused');
      });
      await expect(
        extractBookingSource(db, fixture.tripId, binding.sourceId, {
          operationId: randomUUID(),
          bindingId: binding.id,
          expectedSourceRevision: 0,
          predecessorId: null,
          providerId: 'fictional-provider',
          modelId: 'fictional-model',
          dependencies: { prepare },
        })
      ).rejects.toMatchObject({ code: 'booking_import_unavailable' });
      expect(prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: binding.sourceId,
          providerId: 'fictional-provider',
          modelId: 'fictional-model',
          representation: 'stored-text-json-v1',
          mediaType: 'text/plain',
        })
      );
      expect(getBookingImport(db, fixture.tripId, binding.sourceId)).toEqual(before);
      expect(db.select().from(bookingImportRequests).all()).toEqual(requestsBefore);
    }));

  it('lets concurrent identical operations prepare independently but dispatches only the winning claim', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const binding = await bindBookingSource(db, fixture.tripId, fixture.bindInput);
      const requestsBefore = db.select().from(bookingImportRequests).all();
      const input = {
        operationId: randomUUID(),
        bindingId: binding.id,
        expectedSourceRevision: 0,
        predecessorId: null,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
      };
      let releasePreparation: () => void = () => {
        throw new Error('Preparation barrier was not initialized');
      };
      const bothPrepared = new Promise<void>((resolve) => {
        releasePreparation = resolve;
      });
      let markDispatchStarted: () => void = () => {
        throw new Error('Dispatch start was not initialized');
      };
      const dispatchStarted = new Promise<void>((resolve) => {
        markDispatchStarted = resolve;
      });
      let releaseDispatch: () => void = () => {
        throw new Error('Dispatch barrier was not initialized');
      };
      const dispatchGate = new Promise<void>((resolve) => {
        releaseDispatch = resolve;
      });
      const dispatch = vi.fn(async () => {
        markDispatchStarted();
        await dispatchGate;
        return [{ kind: 'unclassified' as const, facts: {} }];
      });
      let prepareCount = 0;
      const prepare = vi.fn(async () => {
        prepareCount += 1;
        if (prepareCount === 2) releasePreparation();
        await bothPrepared;
        return { dispatch };
      });
      const resultsPromise = Promise.all([
        extractBookingSource(db, fixture.tripId, binding.sourceId, {
          ...input,
          dependencies: { prepare },
        }),
        extractBookingSource(db, fixture.tripId, binding.sourceId, {
          ...input,
          dependencies: { prepare },
        }),
      ]);
      await dispatchStarted;
      releaseDispatch();
      const [first, second] = await resultsPromise;
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(first.id).toBe(second.id);
      const final = getBookingImport(db, fixture.tripId, binding.sourceId);
      expect(final.attempts).toHaveLength(1);
      expect(final.attempts[0]?.state).toBe('succeeded');
      const replayPrepare = vi.fn(async () => {
        throw new Error('Exact replay must bypass preparation');
      });
      expect(
        await extractBookingSource(db, fixture.tripId, binding.sourceId, {
          ...input,
          dependencies: { prepare: replayPrepare },
        })
      ).toEqual(final.attempts[0]);
      expect(replayPrepare).not.toHaveBeenCalled();
      const requestsAfter = db.select().from(bookingImportRequests).all();
      expect(requestsAfter).toHaveLength(requestsBefore.length + 1);
      expect(
        requestsAfter.find((request) => request.operationId === input.operationId)
      ).toMatchObject({
        sourceId: binding.sourceId,
        receipt: { kind: 'extract', attemptId: first.id },
      });
    }));

  it('requires the explicit current predecessor for another attempt', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db);
      const source = getBookingImport(db, fixture.tripId, fixture.binding.sourceId).source;
      const extract = vi.fn(async () => []);
      const input = {
        operationId: randomUUID(),
        bindingId: fixture.binding.id,
        expectedSourceRevision: source.revision,
        predecessorId: null,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
      };
      await expect(
        extractBookingSource(db, fixture.tripId, source.id, {
          ...input,
          dependencies: bookingExtraction(extract),
        })
      ).rejects.toThrow();
      expect(extract).not.toHaveBeenCalled();
      const next = await extractBookingSource(db, fixture.tripId, source.id, {
        ...input,
        operationId: randomUUID(),
        predecessorId: fixture.attempt.id,
        dependencies: bookingExtraction(extract),
      });
      expect(next.predecessorId).toBe(fixture.attempt.id);
      expect(next.id).not.toBe(fixture.attempt.id);
      expect(extract).toHaveBeenCalledTimes(1);
    }));
});
