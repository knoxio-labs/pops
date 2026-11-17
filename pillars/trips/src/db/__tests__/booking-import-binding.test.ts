import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { bindBookingSource, getBookingImport } from '../services/booking-imports.js';
import { getCapture } from '../services/source-queries.js';
import {
  bookingFixture,
  createBookingCapture,
  withBookingDb,
} from './booking-import-test-utils.js';
import { send } from './capture-test-utils.js';

describe('Booking original identity and binding', () => {
  it.each([
    ['composed and decomposed Unicode', '\u00E9', 'e\u0301'],
    ['CRLF and LF line endings', 'First\r\nSecond', 'First\nSecond'],
  ])('keeps stored %s source identities distinct', (_name, firstText, secondText) =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const firstCapture = createBookingCapture(db, fixture.tripId, { originalText: firstText });
      const secondCapture = createBookingCapture(db, fixture.tripId, { originalText: secondText });
      const bind = async (captureId: number) =>
        bindBookingSource(
          db,
          fixture.tripId,
          {
            operationId: randomUUID(),
            selection: { captureId, expectedCaptureRevision: 1, original: { kind: 'text' } },
          },
          {}
        );
      const first = await bind(firstCapture.id);
      const second = await bind(secondCapture.id);
      const firstSource = getBookingImport(db, fixture.tripId, first.sourceId).source;
      const secondSource = getBookingImport(db, fixture.tripId, second.sourceId).source;
      expect(firstSource.representation).toBe('stored-text-json-v1');
      expect(firstSource.id).not.toBe(secondSource.id);
      expect(firstSource.sha256).not.toBe(secondSource.sha256);
      expect(getCapture(db, fixture.tripId, firstCapture.id).originalText).toBe(firstText);
      expect(getCapture(db, fixture.tripId, secondCapture.id).originalText).toBe(secondText);
    })
  );

  it('derives document identity from actual bytes even when the Documents ID stays the same', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const capture = createBookingCapture(db, fixture.tripId, {
        originalText: '',
        attachments: [{ kind: 'document', documentId: 42 }],
      });
      const input = {
        operationId: randomUUID(),
        selection: {
          captureId: capture.id,
          expectedCaptureRevision: capture.revision,
          original: { kind: 'document' as const, documentId: 42 },
        },
      };
      const readDocument = vi.fn(async () => ({
        origin: 'https://documents.example.test',
        mediaType: 'application/pdf',
        bytes: new Uint8Array([1, 2, 3]),
      }));
      const first = await bindBookingSource(db, fixture.tripId, input, { readDocument });
      readDocument.mockResolvedValue({
        origin: 'https://documents.example.test',
        mediaType: 'application/pdf',
        bytes: new Uint8Array([1, 2, 4]),
      });
      expect(await bindBookingSource(db, fixture.tripId, input, { readDocument })).toEqual(first);
      expect(readDocument).toHaveBeenCalledTimes(1);
      const second = await bindBookingSource(
        db,
        fixture.tripId,
        {
          ...input,
          operationId: randomUUID(),
        },
        { readDocument }
      );
      expect(readDocument).toHaveBeenCalledTimes(2);
      const firstSource = getBookingImport(db, fixture.tripId, first.sourceId).source;
      const secondSource = getBookingImport(db, fixture.tripId, second.sourceId).source;
      expect(firstSource.representation).toBe('document-bytes-v1');
      expect(firstSource.byteLength).toBe(secondSource.byteLength);
      expect(firstSource.id).not.toBe(secondSource.id);
      expect(firstSource.sha256).not.toBe(secondSource.sha256);
    }));

  it('reuses immutable text identity across Captures without replacing their original bytes', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const first = await bindBookingSource(db, fixture.tripId, fixture.bindInput, {});
      const secondCapture = createBookingCapture(db, fixture.tripId, {
        originalText: fixture.capture.originalText,
      });
      const second = await bindBookingSource(
        db,
        fixture.tripId,
        {
          operationId: randomUUID(),
          selection: { ...fixture.bindInput.selection, captureId: secondCapture.id },
        },
        {}
      );
      expect(second.sourceId).toBe(first.sourceId);
      expect(second.id).not.toBe(first.id);
      expect(getBookingImport(db, fixture.tripId, first.sourceId).bindings).toHaveLength(2);
      expect(getCapture(db, fixture.tripId, fixture.capture.id)).toEqual(fixture.capture);
      const changed = createBookingCapture(db, fixture.tripId, {
        originalText: `${fixture.capture.originalText}\n`,
      });
      const third = await bindBookingSource(
        db,
        fixture.tripId,
        {
          operationId: randomUUID(),
          selection: { ...fixture.bindInput.selection, captureId: changed.id },
        },
        {}
      );
      expect(third.sourceId).not.toBe(first.sourceId);
    }));

  it('replays the exact bind UUID and rejects changing its original selection', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const binding = await bindBookingSource(db, fixture.tripId, fixture.bindInput, {});
      expect(await bindBookingSource(db, fixture.tripId, fixture.bindInput, {})).toEqual(binding);
      const other = createBookingCapture(db, fixture.tripId);
      await expect(
        bindBookingSource(
          db,
          fixture.tripId,
          {
            ...fixture.bindInput,
            selection: { ...fixture.bindInput.selection, captureId: other.id },
          },
          {}
        )
      ).rejects.toThrow();
      expect(getBookingImport(db, fixture.tripId, binding.sourceId).bindings).toEqual([binding]);
    }));

  it('rejects processing tasks as document originals and stale Capture revisions before fetching', () =>
    withBookingDb(async (db) => {
      const fixture = bookingFixture(db);
      const taskCapture = createBookingCapture(db, fixture.tripId, {
        originalText: '',
        attachments: [{ kind: 'task', taskId: 'accepted-processing-task' }],
      });
      const readDocument = vi.fn(async () => ({
        origin: 'https://documents.example.test',
        mediaType: 'application/pdf',
        bytes: new Uint8Array([1, 2, 3]),
      }));
      await expect(
        bindBookingSource(
          db,
          fixture.tripId,
          {
            operationId: randomUUID(),
            selection: {
              captureId: taskCapture.id,
              expectedCaptureRevision: taskCapture.revision,
              original: { kind: 'document', documentId: 42 },
            },
          },
          { readDocument }
        )
      ).rejects.toThrow();
      send(db, fixture.tripId, {
        kind: 'capture.update',
        id: fixture.capture.id,
        expectedRevision: fixture.capture.revision,
        input: { notes: 'Changed presentation' },
      });
      await expect(
        bindBookingSource(db, fixture.tripId, fixture.bindInput, {
          readDocument,
        })
      ).rejects.toThrow();
      expect(readDocument).not.toHaveBeenCalled();
    }));
});
