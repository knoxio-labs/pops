import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { createClient } from '../documents-api/client';
import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { createClient as createTripsClient } from '../trips-api/client';
import {
  createTripDocumentUploadSession,
  TripDocumentUploadContextError,
} from './trip-document-upload-session';
import { TripDocumentUpload } from './TripDocumentUpload';

import type { TripDocumentUploadContext } from './trip-document-upload-session';
import type { DocumentAssociationTarget } from './types';

afterEach(cleanup);

const context: TripDocumentUploadContext = {
  tripId: 4,
  target: { kind: 'event', id: 8 },
};

it.each([
  { ...context, tripId: 5 },
  { ...context, target: { kind: 'stay', id: 8 } },
  { ...context, target: { kind: 'event', id: 9 } },
  { ...context, documentsClient: createClient({ baseUrl: 'https://other.example/documents' }) },
  { ...context, tripsClient: createTripsClient({ baseUrl: 'https://other.example/trips' }) },
] satisfies TripDocumentUploadContext[])(
  'rejects a mismatched target or owner context: %j',
  (other) => {
    const session = createTripDocumentUploadSession(context);
    expect(() => session.assertContext(other)).toThrow(TripDocumentUploadContextError);
    expect(() => session.assertContext(context)).not.toThrow();
  }
);

it('captures the target value without permitting a caller to mutate its binding', () => {
  const target: DocumentAssociationTarget = { kind: 'event', id: 8 };
  const session = createTripDocumentUploadSession({ tripId: 4, target });
  target.id = 9;
  expect(session.context.target).toEqual({ kind: 'event', id: 8 });
  expect(Object.isFrozen(session.context.target)).toBe(true);
  expect(() => session.assertContext({ tripId: 4, target })).toThrow(
    TripDocumentUploadContextError
  );
});

it('rejects replacement authenticated clients even when their owner origins are identical', () => {
  const documentsClient = createClient({ baseUrl: 'https://pops.example/documents-api' });
  const tripsClient = createTripsClient({ baseUrl: 'https://pops.example/trips-api' });
  const captured = { ...context, documentsClient, tripsClient };
  const session = createTripDocumentUploadSession(captured);
  expect(() =>
    session.assertContext({
      ...captured,
      documentsClient: createClient({ baseUrl: documentsClient.getConfig().baseUrl }),
    })
  ).toThrow(TripDocumentUploadContextError);
  expect(() =>
    session.assertContext({
      ...captured,
      tripsClient: createTripsClient({ baseUrl: tripsClient.getConfig().baseUrl }),
    })
  ).toThrow(TripDocumentUploadContextError);
  documentsClient.setConfig({ baseUrl: 'https://other.example/documents-api' });
  expect(() => session.assertContext(captured)).toThrow(TripDocumentUploadContextError);
});

it('rejects a mismatched view before any target can reuse the retained files', () => {
  const session = createTripDocumentUploadSession(context);
  session.addFiles([new File(['a'], 'a.pdf', { type: 'application/pdf' })]);
  const cache = new QueryClient();
  expect(() =>
    render(
      <QueryClientProvider client={cache}>
        <TripDocumentUpload {...context} target={{ kind: 'journey', id: 8 }} session={session} />
      </QueryClientProvider>
    )
  ).toThrow(TripDocumentUploadContextError);
  expect(cache.getQueryCache().getAll()).toHaveLength(0);
  expect(session.read()[0]?.upload.taskId).toBeNull();
  cache.clear();
});

it('captures the actual default owner origin instead of an unobservable default marker', () => {
  const before = defaultDocumentsClient.getConfig().baseUrl;
  const session = createTripDocumentUploadSession(context);
  try {
    defaultDocumentsClient.setConfig({ baseUrl: 'https://different.example/documents-api' });
    expect(() => session.assertContext(context)).toThrow(TripDocumentUploadContextError);
  } finally {
    defaultDocumentsClient.setConfig({ baseUrl: before });
  }
  expect(() => session.assertContext(context)).not.toThrow();
});
