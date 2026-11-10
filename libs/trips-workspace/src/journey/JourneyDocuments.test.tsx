import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import {
  loadDocumentAssociations,
  loadPaperlessDocument,
  loadPaperlessUploadPolicy,
} from '../documents/api';
import { JourneyWorkspace } from './JourneyWorkspace';
import { journeyTransport, sourceJourney, sourceLeg } from './test-utils';

vi.mock('../documents/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../documents/api')>()),
  loadDocumentAssociations: vi.fn(),
  loadPaperlessDocument: vi.fn(),
  loadPaperlessUploadPolicy: vi.fn(),
}));
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
});

it('scopes expanded alternative documents to that journey while retaining the viewed source files', async () => {
  const transport = journeyTransport({
    groups: [
      {
        id: 80,
        tripId: 7,
        currentJourneyId: 20,
        alternativeJourneyIds: [21],
        revision: 3,
        createdAt: '2029-01-01T00:00:00Z',
        updatedAt: '2029-01-01T00:00:00Z',
      },
    ],
    alternatives: [
      {
        legRevision: 0,
        journey: sourceJourney({ id: 21, name: 'Ferry alternative' }),
        legs: [sourceLeg({ id: 41, journeyId: 21 })],
      },
    ],
  });
  vi.mocked(loadDocumentAssociations).mockResolvedValue(
    [20, 21].map((id) => ({
      id: id + 60,
      tripId: 7,
      targetKind: 'journey',
      targetId: id,
      documentId: id + 70,
      createdAt: '2029-01-01T00:00:00Z',
    }))
  );
  vi.mocked(loadPaperlessDocument).mockImplementation(async (id) => ({
    id,
    title: `Original ${id}`,
    created: '2029-01-01',
    originalFileName: `${id}.pdf`,
    thumbnailUrl: '',
  }));
  vi.mocked(loadPaperlessUploadPolicy).mockResolvedValue({
    configured: false,
    available: false,
    maxUploadBytes: 1000,
    allowedMimeTypes: ['application/pdf'],
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <JourneyWorkspace tripId={7} journeyId={20} client={transport.client} />
    </QueryClientProvider>
  );
  expect(await screen.findByText('Original 90')).toBeVisible();
  const alternative = await screen.findByRole('article', { name: 'Journey option 21' });
  fireEvent.click(within(alternative).getByRole('button', { name: 'Edit option' }));
  expect(await within(alternative).findByText('Original 91')).toBeVisible();
  expect(within(alternative).queryByText('Original 90')).not.toBeInTheDocument();
  expect(screen.getByText('Original 90')).toBeVisible();
});
