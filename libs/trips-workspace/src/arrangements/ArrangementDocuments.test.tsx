import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import {
  createTripDocumentUploadSession,
  TripDocumentUploadContextError,
} from '../documents/trip-document-upload-session';
import { TripDocumentLinks } from '../documents/TripDocumentLinks';
import { TripDocumentUpload } from '../documents/TripDocumentUpload';
import { createClient } from '../trips-api/client';
import { ArrangementDocuments } from './ArrangementDocuments';
import { labels } from './test-utils';

const identity = { tripId: 7, labels, formatDate: (date: string): string => date };
const target = { targetKind: 'journey', targetId: 20 } as const;

vi.mock('../documents/TripDocumentLinks', () => ({ TripDocumentLinks: vi.fn(() => null) }));
vi.mock('../documents/TripDocumentUpload', () => ({ TripDocumentUpload: vi.fn(() => null) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('forwards the exact owner context and retained session to canonical controls', () => {
  const session = createTripDocumentUploadSession({
    tripId: 7,
    target: { kind: 'journey', id: 20 },
  });
  render(<ArrangementDocuments session={session} identity={identity} target={target} />);
  const context = { ...session.context, tripsClient: undefined, documentsClient: undefined };
  expect(vi.mocked(TripDocumentLinks).mock.calls[0]?.[0]).toEqual(context);
  expect(vi.mocked(TripDocumentUpload).mock.calls[0]?.[0]).toEqual({ ...context, session });
});
it.each(['trips', 'documents', 'trip', 'target'] as const)(
  'rejects stale session context before mounting owner actions after a current %s replacement',
  (change) => {
    const first = createClient({ baseUrl: 'https://trips.example' });
    const documents = createDocumentsClient({ baseUrl: 'https://documents.example' });
    const session = createTripDocumentUploadSession({
      tripId: 7,
      target: { kind: 'journey', id: 20 },
      tripsClient: first,
      documentsClient: documents,
    });
    const current = {
      ...identity,
      tripId: change === 'trip' ? 8 : 7,
      client: change === 'trips' ? createClient({ baseUrl: 'https://trips.example' }) : first,
      documentsClient:
        change === 'documents'
          ? createDocumentsClient({ baseUrl: 'https://documents.example' })
          : documents,
    };
    expect(() =>
      render(
        <ArrangementDocuments
          session={session}
          identity={current}
          target={change === 'target' ? { ...target, targetId: 21 } : target}
        />
      )
    ).toThrow(TripDocumentUploadContextError);
    expect(TripDocumentLinks).not.toHaveBeenCalled();
    expect(TripDocumentUpload).not.toHaveBeenCalled();
  }
);
