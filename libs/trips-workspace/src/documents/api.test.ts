import { describe, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import { createClient as createTripsClient } from '../trips-api/client';
import {
  loadTripDocumentTargets,
  paperlessOriginalUrl,
  paperlessThumbnailUrl,
  uploadPaperlessDocument,
} from './api';

describe('Documents file URLs', () => {
  it('routes both previews and originals through the authenticated Documents proxy', () => {
    expect(paperlessThumbnailUrl(21)).toBe('/documents-api/documents/21/thumbnail');
    expect(paperlessOriginalUrl(21)).toBe(
      '/documents-api/paperless/documents/21/download?original=true'
    );
  });
});

describe('uploadPaperlessDocument', () => {
  it('sends the selected file as the raw body to the Documents owner and returns its task id', async () => {
    let observed: { method: string; url: string; contentType: string | null } | undefined;
    let sentBody: unknown;
    const client = createClient({
      baseUrl: 'https://pops.example/documents-api',
      fetch: vi.fn<typeof fetch>(async (request) => {
        const sent = request instanceof Request ? request : new Request(request);
        observed = {
          method: sent.method,
          url: sent.url,
          contentType: sent.headers.get('content-type'),
        };
        return Response.json({ data: { taskId: 'task_123' } }, { status: 202 });
      }),
    });
    client.interceptors.request.use((request, options) => {
      sentBody = options.body;
      return request;
    });
    const file = new File(['original-content'], 'ticket.pdf', { type: 'application/pdf' });

    await expect(uploadPaperlessDocument(file, client)).resolves.toBe('task_123');

    expect(observed?.method).toBe('POST');
    expect(new URL(observed?.url ?? 'https://pops.example').pathname).toBe(
      '/documents-api/paperless/documents'
    );
    expect(new URL(observed?.url ?? 'https://pops.example').searchParams.get('fileName')).toBe(
      'ticket.pdf'
    );
    expect(observed?.contentType).toBe('application/pdf');
    expect(sentBody).toBe(file);
  });
});

describe('malformed owner upload acceptance', () => {
  it('rejects an incomplete 202 rather than allowing another unguarded upload', async () => {
    const client = createClient({
      baseUrl: 'https://pops.example/documents-api',
      fetch: vi.fn<typeof fetch>(async () => Response.json({ data: {} }, { status: 202 })),
    });
    await expect(
      uploadPaperlessDocument(new File(['a'], 'a.pdf', { type: 'application/pdf' }), client)
    ).rejects.toThrow('valid upload task identity');
  });
});

describe('loadTripDocumentTargets', () => {
  it('labels owner records and only associates events and stays with their declared visit', async () => {
    const client = createTripsClient({
      baseUrl: 'https://pops.example/trips-api',
      fetch: vi.fn<typeof fetch>(async (request) => {
        const url = new URL(request instanceof Request ? request.url : String(request));
        const bodies: Record<string, unknown> = {
          '/trips-api/places': {
            places: [{ id: 1, name: 'Lisbon', createdAt: '', updatedAt: '', sourceLinks: [] }],
          },
          '/trips-api/trips/4/visits': {
            visits: [
              {
                id: 8,
                tripId: 4,
                placeId: 1,
                notes: '',
                createdAt: '',
                updatedAt: '',
                timing: {},
                sourceLinks: [],
              },
            ],
          },
          '/trips-api/trips/4/stays': {
            stays: [
              {
                id: 9,
                tripId: 4,
                visitId: 8,
                name: 'Harbour hotel',
                kind: null,
                status: null,
                timing: {},
                address: null,
                reference: null,
                notes: '',
                sourceLinks: [],
                hostLinks: [],
                documentLinks: [],
                createdAt: '',
                updatedAt: '',
              },
            ],
          },
          '/trips-api/trips/4/events': {
            events: [
              {
                id: 10,
                tripId: 4,
                visitId: null,
                name: 'Museum visit',
                intention: null,
                arrangement: null,
                purchase: null,
                timing: {},
                address: null,
                reference: null,
                notes: '',
                sourceUrl: null,
                ticketUrl: null,
                sourceLinks: [],
                organiserLinks: [],
                venueLinks: [],
                documentLinks: [],
                createdAt: '',
                updatedAt: '',
              },
            ],
          },
          '/trips-api/trips/4/journeys': {
            journeys: [
              {
                id: 11,
                tripId: 4,
                name: 'Coastal transfer',
                notes: '',
                reference: null,
                buffers: {},
                sourceLinks: [],
                createdAt: '',
                updatedAt: '',
              },
            ],
          },
        };
        return Response.json(bodies[url.pathname]);
      }),
    });

    await expect(loadTripDocumentTargets(4, client)).resolves.toEqual(
      new Map([
        ['visit:8', { name: 'Lisbon', visitId: 8 }],
        ['stay:9', { name: 'Harbour hotel', visitId: 8 }],
        ['event:10', { name: 'Museum visit', visitId: null }],
        ['journey:11', { name: 'Coastal transfer', visitId: null }],
      ])
    );
  });
});
