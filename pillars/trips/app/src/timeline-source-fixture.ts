import { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { createClient } from './trips-api/client';

import type { StaysGetResponses } from './trips-api/types.gen';

/** Generated transport fixture recording actual source commands and explicit response loss. */
export function timelineSourceOwner() {
  let source = initialStay();
  const patches: unknown[] = [];
  const unexpected: string[] = [];
  let loseNext = false;
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === '/trips/7/stays/13') {
      if (request.method === 'PATCH') {
        const body: unknown = await request.json();
        patches.push(body);
        if (loseNext) {
          loseNext = false;
          throw new TypeError('Response lost');
        }
        const patch = z.object({ name: z.string().nullable().optional() }).parse(body);
        source = { ...source, ...patch };
      }
      return Response.json(source);
    }
    if (path === '/trips/7')
      return Response.json({
        id: 7,
        name: 'Owning trip',
        destination: '',
        when: '',
        parentId: null,
        tagId: null,
        notes: '',
        sourceLinks: [],
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      });
    const collections = contextResponses(source);
    if (Object.hasOwn(collections, path)) return Response.json(collections[path]);
    const diagnostic = `${request.method} ${path}`;
    unexpected.push(diagnostic);
    throw new Error(`Unexpected source fixture request: ${diagnostic}`);
  };
  return {
    client: createClient({ baseUrl: 'https://trips.test', fetch: fetcher }),
    cache: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
    patches,
    unexpected,
    loseNextWrite: () => {
      loseNext = true;
    },
  };
}

function contextResponses(source: StaysGetResponses[200]): Record<string, unknown> {
  return {
    '/trips/7/stays': { stays: [source] },
    '/trips/7/visits': { visits: [] },
    '/places': { places: [] },
    '/trips/7/events': { events: [] },
    '/trips/7/journeys': { journeys: [] },
    '/trips/7/document-associations': { associations: [] },
    '/trips/7/responsibilities/stay/13': {
      tripId: 7,
      targetKind: 'stay',
      targetId: 13,
      revision: 0,
      responsibility: null,
    },
    '/paperless/status': {
      data: {
        configured: false,
        available: false,
        baseUrl: null,
        documentCount: null,
        maxUploadBytes: 1024,
        allowedMimeTypes: [],
      },
    },
  };
}

function initialStay(): StaysGetResponses[200] {
  return {
    id: 13,
    tripId: 7,
    visitId: null,
    name: 'Original stay',
    kind: null,
    status: null,
    timing: {},
    address: null,
    reference: null,
    notes: '',
    sourceLinks: [],
    hostLinks: [],
    documentLinks: [],
    createdAt: '2026-11-10T00:00:00Z',
    updatedAt: '2026-11-10T00:00:00Z',
  };
}
