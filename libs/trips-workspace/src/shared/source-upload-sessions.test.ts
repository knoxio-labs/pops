import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { createClient as createTripsClient } from '../trips-api/client';
import { sourceUploadSession } from './source-upload-sessions';

import type { TripDocumentUploadContext } from '../documents/trip-document-upload-session';

function context(): TripDocumentUploadContext {
  return {
    tripId: 7,
    target: { kind: 'event', id: 19 },
    tripsClient: createTripsClient({ baseUrl: 'https://trips.example' }),
    documentsClient: createDocumentsClient({ baseUrl: 'https://documents.example' }),
  };
}

describe('source upload host lifetime', () => {
  it('retains the same opaque owner queue and browser File across query removal and cache clear', () => {
    const scope = new QueryClient();
    const source = context();
    const original = sourceUploadSession(scope, source);
    const file = new File(['ticket'], 'ticket.pdf', { type: 'application/pdf' });
    original.addFiles([file]);
    scope.setQueryData(['source'], { id: 19 });
    scope.removeQueries();
    scope.clear();
    const reopened = sourceUploadSession(scope, { ...source, target: { ...source.target } });
    expect(reopened).toBe(original);
    expect(reopened.read()).toHaveLength(1);
    expect(reopened.read()[0]?.file).toBe(file);
  });

  it.each([
    { tripId: 8, target: { kind: 'event', id: 19 } },
    { tripId: 7, target: { kind: 'stay', id: 19 } },
    { tripId: 7, target: { kind: 'event', id: 20 } },
  ] satisfies Pick<TripDocumentUploadContext, 'tripId' | 'target'>[])(
    'isolates explicit source context %j and restores the original queue on return',
    (other) => {
      const scope = new QueryClient();
      const source = context();
      const original = sourceUploadSession(scope, source);
      original.addFiles([new File(['A'], 'same.pdf')]);
      const replacement = sourceUploadSession(scope, { ...source, ...other });
      expect(replacement).not.toBe(original);
      expect(replacement.read()).toEqual([]);
      expect(sourceUploadSession(scope, source)).toBe(original);
    }
  );

  it('isolates different client instances even when their owner origins are identical', () => {
    const scope = new QueryClient();
    const source = context();
    const original = sourceUploadSession(scope, source);
    expect(
      sourceUploadSession(scope, {
        ...source,
        tripsClient: createTripsClient({ baseUrl: 'https://trips.example' }),
      })
    ).not.toBe(original);
    expect(
      sourceUploadSession(scope, {
        ...source,
        documentsClient: createDocumentsClient({ baseUrl: 'https://documents.example' }),
      })
    ).not.toBe(original);
  });

  it('isolates an origin change on an existing client and a new Shell QueryClient lifetime', () => {
    const scope = new QueryClient();
    const source = context();
    const original = sourceUploadSession(scope, source);
    source.tripsClient?.setConfig({ baseUrl: 'https://different-trips.example' });
    expect(sourceUploadSession(scope, source)).not.toBe(original);
    expect(sourceUploadSession(new QueryClient(), source)).not.toBe(original);
  });

  it('observes default owner origin changes without relying on query-cache invalidation', () => {
    const scope = new QueryClient();
    const source = {
      tripId: 7,
      target: { kind: 'event', id: 19 },
    } satisfies TripDocumentUploadContext;
    const origin = defaultDocumentsClient.getConfig().baseUrl;
    try {
      const original = sourceUploadSession(scope, source);
      defaultDocumentsClient.setConfig({ baseUrl: 'https://replacement-documents.example' });
      expect(sourceUploadSession(scope, source)).not.toBe(original);
    } finally {
      defaultDocumentsClient.setConfig({ baseUrl: origin });
    }
  });
});
