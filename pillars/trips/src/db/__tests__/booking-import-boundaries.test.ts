import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  BookingBindInputSchema,
  BookingExtractInputSchema,
} from '../../contract/booking-imports.js';
import { openTripsDb } from '../index.js';
import { bookingImportRequests } from '../schema.js';
import {
  bindBookingSource,
  extractBookingSource,
  getBookingImport,
} from '../services/booking-imports.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import {
  bookingExtraction,
  bookingFixture,
  preparedBooking,
  withBookingDb,
} from './booking-import-test-utils.js';

import type { BookingProposal } from '../../contract/booking-import-values.js';
import type { OpenedTripsDb } from '../index.js';

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise not initialized');
  };
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}

describe('Booking import contract and content boundaries', () => {
  it('reopens a durable unknown claim without another provider invocation or implicit successor', async () => {
    const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
    mkdirSync(scratch, { recursive: true });
    const directory = mkdtempSync(join(scratch, 'booking-import-reopen-'));
    const path = join(directory, 'trips.db');
    let opened: OpenedTripsDb | undefined = openTripsDb(path);
    try {
      const fixture = bookingFixture(opened.db);
      const binding = await bindBookingSource(opened.db, fixture.tripId, fixture.bindInput);
      const input = {
        operationId: randomUUID(),
        bindingId: binding.id,
        expectedSourceRevision: 0,
        predecessorId: null,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
      };
      const extract = vi.fn(async (): Promise<never> => {
        throw new Error('Unknown dispatch outcome');
      });
      const unknown = await extractBookingSource(opened.db, fixture.tripId, binding.sourceId, {
        ...input,
        dependencies: bookingExtraction(extract),
      });
      expect(unknown.state).toBe('outcome_unknown');
      opened.raw.close();
      opened = undefined;
      opened = openTripsDb(path);
      const snapshot = getBookingImport(opened.db, fixture.tripId, binding.sourceId);
      expect(snapshot.attempts).toEqual([unknown]);
      expect(
        await extractBookingSource(opened.db, fixture.tripId, binding.sourceId, {
          ...input,
          dependencies: bookingExtraction(extract),
        })
      ).toEqual(unknown);
      await expect(
        extractBookingSource(opened.db, fixture.tripId, binding.sourceId, {
          ...input,
          operationId: randomUUID(),
          expectedSourceRevision: snapshot.source.revision,
          dependencies: bookingExtraction(extract),
        })
      ).rejects.toMatchObject({ code: 'booking_import_conflict' });
      expect(extract).toHaveBeenCalledTimes(1);
      expect(getBookingImport(opened.db, fixture.tripId, binding.sourceId)).toEqual(snapshot);
    } finally {
      opened?.raw.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps the latest pointer when an older in-flight attempt returns after its explicit successor', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const binding = await bindBookingSource(db, fixture.tripId, fixture.bindInput);
      const started = deferred<void>();
      const response = deferred<readonly Omit<BookingProposal, 'id'>[]>();
      const input = {
        operationId: randomUUID(),
        bindingId: binding.id,
        expectedSourceRevision: 0,
        predecessorId: null,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
      };
      const old = extractBookingSource(db, fixture.tripId, binding.sourceId, {
        ...input,
        dependencies: {
          prepare: async () => ({
            dispatch: async () => {
              started.resolve(undefined);
              return response.promise;
            },
          }),
        },
      });
      await started.promise;
      const claimed = getBookingImport(db, fixture.tripId, binding.sourceId).source;
      try {
        const next = await extractBookingSource(db, fixture.tripId, binding.sourceId, {
          ...input,
          operationId: randomUUID(),
          expectedSourceRevision: claimed.revision,
          predecessorId: claimed.latestAttemptId,
          dependencies: bookingExtraction(async () => [{ kind: 'stay', facts: {} }]),
        });
        response.resolve([{ kind: 'event', facts: {} }]);
        const previous = await old;
        const snapshot = getBookingImport(db, fixture.tripId, binding.sourceId);
        expect(previous.state).toBe('succeeded');
        expect(snapshot.source.latestAttemptId).toBe(next.id);
        expect(snapshot.attempts).toHaveLength(2);
        expect(readSourceWorkspace(db, fixture.tripId).events).toEqual([]);
        expect(readSourceWorkspace(db, fixture.tripId).stays).toEqual([]);
      } finally {
        response.resolve([]);
        await old;
      }
    }));

  it('keeps identical source material in different trips independent', () =>
    withBookingDb(async (db) => {
      const first = bookingFixture(db);
      const second = bookingFixture(db);
      const firstBinding = await bindBookingSource(db, first.tripId, first.bindInput);
      const secondBinding = await bindBookingSource(db, second.tripId, second.bindInput);
      const firstSource = getBookingImport(db, first.tripId, firstBinding.sourceId).source;
      const secondSource = getBookingImport(db, second.tripId, secondBinding.sourceId).source;
      expect(firstSource.sha256).toBe(secondSource.sha256);
      expect(firstSource.id).not.toBe(secondSource.id);
      expect(() => getBookingImport(db, first.tripId, secondSource.id)).toThrow();
      expect(() => getBookingImport(db, second.tripId, firstSource.id)).toThrow();
    }));

  it('rejects caller-supplied digests and original bytes rather than treating them as proof', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      expect(
        BookingBindInputSchema.safeParse({
          ...fixture.bindInput,
          sha256: '0'.repeat(64),
          byteLength: 3,
        }).success
      ).toBe(false);
      expect(
        BookingBindInputSchema.safeParse({
          ...fixture.bindInput,
          selection: {
            ...fixture.bindInput.selection,
            original: { kind: 'text', bytes: [1, 2, 3] },
          },
        }).success
      ).toBe(false);
      expect(
        BookingExtractInputSchema.safeParse({
          operationId: randomUUID(),
          bindingId: randomUUID(),
          expectedSourceRevision: 0,
          predecessorId: null,
          providerId: 'fictional-provider',
          modelId: 'fictional-model',
          verified: true,
        }).success
      ).toBe(false);
    }));

  it('fails unavailable adapters without changing the original or claiming an attempt', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const binding = await bindBookingSource(db, fixture.tripId, fixture.bindInput);
      const before = readSourceWorkspace(db, fixture.tripId);
      const source = getBookingImport(db, fixture.tripId, binding.sourceId);
      const requestsBefore = db.select().from(bookingImportRequests).all();
      await expect(
        extractBookingSource(db, fixture.tripId, binding.sourceId, {
          operationId: randomUUID(),
          bindingId: binding.id,
          expectedSourceRevision: 0,
          predecessorId: null,
          providerId: 'fictional-provider',
          modelId: 'fictional-model',
        })
      ).rejects.toMatchObject({ code: 'booking_import_unavailable' });
      expect(readSourceWorkspace(db, fixture.tripId)).toEqual(before);
      expect(getBookingImport(db, fixture.tripId, binding.sourceId)).toEqual(source);
      expect(db.select().from(bookingImportRequests).all()).toEqual(requestsBefore);
    }));

  it('keeps resegmented and reordered proposals noncanonical across explicit attempts', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db);
      const source = getBookingImport(db, fixture.tripId, fixture.binding.sourceId).source;
      const before = readSourceWorkspace(db, fixture.tripId);
      const next = await extractBookingSource(db, fixture.tripId, source.id, {
        operationId: randomUUID(),
        bindingId: fixture.binding.id,
        expectedSourceRevision: source.revision,
        predecessorId: fixture.attempt.id,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
        dependencies: bookingExtraction(async () => [
          { kind: 'event', facts: {} },
          { kind: 'stay', facts: {} },
        ]),
      });
      expect(next.state).toBe('succeeded');
      expect(next.proposals.map((proposal) => proposal.kind)).toEqual(['event', 'stay']);
      expect(next.proposals.map((proposal) => proposal.id)).not.toContain(
        fixture.attempt.proposals[0]?.id
      );
      const latest = getBookingImport(db, fixture.tripId, source.id).source;
      const reordered = await extractBookingSource(db, fixture.tripId, source.id, {
        operationId: randomUUID(),
        bindingId: fixture.binding.id,
        expectedSourceRevision: latest.revision,
        predecessorId: next.id,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
        dependencies: bookingExtraction(async () => [
          { kind: 'stay', facts: {} },
          { kind: 'event', facts: {} },
        ]),
      });
      expect(reordered.proposals.map((proposal) => proposal.kind)).toEqual(['stay', 'event']);
      expect(reordered.proposals.map((proposal) => proposal.id)).not.toEqual(
        next.proposals.map((proposal) => proposal.id).toReversed()
      );
      expect(readSourceWorkspace(db, fixture.tripId)).toEqual(before);
      expect(getBookingImport(db, fixture.tripId, source.id).decisions).toEqual([]);
    }));

  it('retains an unknown outcome without proposals when quoted text is absent from the original', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const binding = await bindBookingSource(db, fixture.tripId, fixture.bindInput);
      const before = readSourceWorkspace(db, fixture.tripId);
      const attempt = await extractBookingSource(db, fixture.tripId, binding.sourceId, {
        operationId: randomUUID(),
        bindingId: binding.id,
        expectedSourceRevision: 0,
        predecessorId: null,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
        dependencies: bookingExtraction(async () => [
          {
            kind: 'stay',
            facts: {
              name: {
                state: 'stated',
                values: ['Invented hotel'],
                evidence: [{ kind: 'text', quote: 'Absent quote' }],
              },
            },
          },
        ]),
      });
      expect(attempt.state).toBe('outcome_unknown');
      expect(attempt.proposals).toEqual([]);
      expect(readSourceWorkspace(db, fixture.tripId)).toEqual(before);
    }));
});
