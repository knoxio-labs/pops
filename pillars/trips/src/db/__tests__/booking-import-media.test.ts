import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { bookingImportAttempts, bookingImportBindings, bookingImportSources } from '../schema.js';
import {
  bindBookingSource,
  extractBookingSource,
  getBookingImport,
} from '../services/booking-imports.js';
import {
  bookingExtraction,
  bookingFixture,
  createBookingCapture,
  withBookingDb,
} from './booking-import-test-utils.js';

describe('Booking document media admission', () => {
  it.each(['image/png', 'text/plain', 'application/octet-stream', null])(
    'does not bind unsupported owner media %j as PDF',
    (mediaType) =>
      withBookingDb(async (db) => {
        const fixture = bookingFixture(db);
        const capture = createBookingCapture(db, fixture.tripId, {
          originalText: '',
          attachments: [{ kind: 'document', documentId: 42 }],
        });
        await expect(
          bindBookingSource(
            db,
            fixture.tripId,
            {
              operationId: randomUUID(),
              selection: {
                captureId: capture.id,
                expectedCaptureRevision: capture.revision,
                original: { kind: 'document', documentId: 42 },
              },
            },
            {
              readDocument: async () => ({
                origin: 'https://documents.example.test',
                mediaType,
                bytes: new Uint8Array([1, 2, 3]),
              }),
            }
          )
        ).rejects.toMatchObject({ code: 'booking_import_invalid' });
        expect(db.select().from(bookingImportSources).all()).toEqual([]);
        expect(db.select().from(bookingImportBindings).all()).toEqual([]);
        expect(db.select().from(bookingImportAttempts).all()).toEqual([]);
      })
  );

  it.each(['image/png', 'text/plain', null])(
    'rechecks actual media %j before claiming an extraction',
    (mediaType) =>
      withBookingDb(async (db) => {
        const fixture = bookingFixture(db);
        const capture = createBookingCapture(db, fixture.tripId, {
          originalText: '',
          attachments: [{ kind: 'document', documentId: 42 }],
        });
        const selection = {
          captureId: capture.id,
          expectedCaptureRevision: capture.revision,
          original: { kind: 'document' as const, documentId: 42 },
        };
        const bytes = new Uint8Array([1, 2, 3]);
        const binding = await bindBookingSource(
          db,
          fixture.tripId,
          { operationId: randomUUID(), selection },
          {
            readDocument: async () => ({
              origin: 'https://documents.example.test',
              mediaType: 'application/pdf; version=1.7',
              bytes,
            }),
          }
        );
        expect(binding.mediaType).toBe('application/pdf');
        const before = getBookingImport(db, fixture.tripId, binding.sourceId);
        const dispatch = vi.fn(async () => []);
        const prepare = vi.fn(async () => ({ dispatch }));
        await expect(
          extractBookingSource(db, fixture.tripId, binding.sourceId, {
            operationId: randomUUID(),
            bindingId: binding.id,
            expectedSourceRevision: 0,
            predecessorId: null,
            providerId: 'fictional-provider',
            modelId: 'fictional-model',
            dependencies: {
              readDocument: async () => ({
                origin: 'https://documents.example.test',
                mediaType,
                bytes,
              }),
              prepare,
            },
          })
        ).rejects.toMatchObject({ code: 'booking_import_invalid' });
        expect(prepare).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
        expect(getBookingImport(db, fixture.tripId, binding.sourceId)).toEqual(before);
      })
  );

  it('passes verified PDF media to the adapter and retains PDF evidence as unverified reports', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const capture = createBookingCapture(db, fixture.tripId, {
        originalText: '',
        attachments: [{ kind: 'document', documentId: 42 }],
      });
      const selection = {
        captureId: capture.id,
        expectedCaptureRevision: capture.revision,
        original: { kind: 'document' as const, documentId: 42 },
      };
      const readDocument = async () => ({
        origin: 'https://documents.example.test',
        mediaType: 'APPLICATION/PDF',
        bytes: new Uint8Array([1, 2, 3]),
      });
      const binding = await bindBookingSource(
        db,
        fixture.tripId,
        { operationId: randomUUID(), selection },
        { readDocument }
      );
      const attempt = await extractBookingSource(db, fixture.tripId, binding.sourceId, {
        operationId: randomUUID(),
        bindingId: binding.id,
        expectedSourceRevision: 0,
        predecessorId: null,
        providerId: 'fictional-provider',
        modelId: 'fictional-model',
        dependencies: {
          readDocument,
          ...bookingExtraction(async (original) => {
            expect(original.mediaType).toBe('application/pdf');
            return [
              {
                kind: 'stay',
                facts: {
                  name: {
                    state: 'stated',
                    values: ['Fictional hotel'],
                    evidence: [{ kind: 'reported-pdf', quote: 'Fictional hotel', page: 1 }],
                  },
                },
              },
            ];
          }),
        },
      });
      expect(attempt.state).toBe('succeeded');
      expect(attempt.proposals[0]?.facts['name']?.evidence).toEqual([
        { kind: 'reported-pdf', quote: 'Fictional hotel', page: 1 },
      ]);
    }));
});
