import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { loadDocumentAssociations } from '../documents/api';
import { EventWorkspace } from '../event/EventWorkspace';
import { eventTransport } from '../event/test-utils';
import { JourneyWorkspace } from '../journey/JourneyWorkspace';
import { journeyTransport } from '../journey/test-utils';
import { StayWorkspace } from '../stay/StayWorkspace';
import { problem, workspaceTransport } from '../stay/test-utils';

vi.mock('../documents/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../documents/api')>()),
  loadDocumentAssociations: vi.fn(),
}));
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
});

it.each(['event', 'stay', 'journey'] as const)(
  'does not attach files to an unavailable %s source',
  async (kind) => {
    const event = eventTransport({ missing: true });
    const stay = workspaceTransport({
      gets: [{ status: 404, body: problem('trips.record.not_found') }],
    });
    const journey = journeyTransport({ sourceFailure: 404 });
    const hosts = {
      event: <EventWorkspace tripId={7} eventId={19} client={event.client} />,
      stay: <StayWorkspace tripId={7} stayId={13} client={stay.client} />,
      journey: <JourneyWorkspace tripId={7} journeyId={20} client={journey.client} />,
    };
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    caches.push(cache);
    render(<QueryClientProvider client={cache}>{hosts[kind]}</QueryClientProvider>);
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Choose existing document' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Source documents' })).not.toBeInTheDocument();
    expect(loadDocumentAssociations).not.toHaveBeenCalled();
  }
);
