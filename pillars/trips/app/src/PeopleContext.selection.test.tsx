import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { PeopleContext } from './PeopleContext';
import { createClient } from './trips-api/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

it('retains an unsaved exact meeting field across actual public context unmount without writing', async () => {
  const writes: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== 'GET') writes.push(request);
    const meetings = new URL(request.url).pathname.endsWith('/meeting-plans');
    return new Response(
      JSON.stringify(
        meetings
          ? {
              meetingPlans: [
                {
                  id: 41,
                  tripId: 7,
                  revision: 1,
                  removed: false,
                  contactUri: null,
                  visitId: null,
                  title: 'Canonical meeting',
                  notes: '',
                  intention: 'Considering',
                  agreement: 'Not agreed',
                  startDate: null,
                  endDate: null,
                  createdAt: '2029-01-01T00:00:00Z',
                  updatedAt: '2029-01-01T00:00:00Z',
                },
              ],
            }
          : { code: 'context.unavailable', message: 'Unavailable', retryable: true }
      ),
      { status: meetings ? 200 : 503, headers: { 'content-type': 'application/json' } }
    );
  };
  const client = createClient({
    baseUrl: `http://context-${crypto.randomUUID()}.test`,
    fetch: transport,
  });
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={query}>
      <PeopleContext tripId={7} meetingId={41} client={client} />
    </QueryClientProvider>
  );
  const first = render(view());
  const field = within(await screen.findByRole('article')).getByLabelText('people.planTitle');
  fireEvent.change(field, { target: { value: 'Unsubmitted exact meeting' } });
  first.unmount();
  render(view());
  expect(within(await screen.findByRole('article')).getByLabelText('people.planTitle')).toHaveValue(
    'Unsubmitted exact meeting'
  );
  expect(writes).toEqual([]);
});
