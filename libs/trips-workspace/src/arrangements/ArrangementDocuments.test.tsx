import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createTripDocumentUploadSession } from '../documents/trip-document-upload-session';
import { TripDocumentLinks } from '../documents/TripDocumentLinks';
import { TripDocumentUpload } from '../documents/TripDocumentUpload';
import { ArrangementDocuments } from './ArrangementDocuments';

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
  render(<ArrangementDocuments session={session} />);
  expect(vi.mocked(TripDocumentLinks).mock.calls[0]?.[0]).toEqual(session.context);
  expect(vi.mocked(TripDocumentUpload).mock.calls[0]?.[0]).toEqual({ ...session.context, session });
});
