import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';

import { sourceVisit, visitTransport } from './test-utils';
import english from './translation.test-fixture.json';
import { VisitWorkspace } from './VisitWorkspace';

const locale = createInstance();
await locale.init({
  lng: 'en-AU',
  resources: { 'en-AU': { trips: { visitWorkspace: english } } },
  interpolation: { escapeValue: false },
});
afterEach(cleanup);

it('retains failed edits after a failed explicit reload and discards them only after the canonical read succeeds', async () => {
  const transport = visitTransport();
  const fetcher = transport.client.getConfig().fetch;
  if (!fetcher) throw new Error('The fixture requires its owning HTTP transport.');
  let failRead = false;
  let rejectedReads = 0;
  transport.client.setConfig({
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (
        failRead &&
        request.method === 'GET' &&
        new URL(request.url).pathname === '/trips/7/visits/31'
      ) {
        rejectedReads++;
        return Response.json(
          { code: 'trips.unavailable', message: 'Unavailable', retryable: true },
          { status: 503 }
        );
      }
      return fetcher(request);
    },
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <I18nextProvider i18n={locale}>
      <QueryClientProvider client={cache}>
        <VisitWorkspace tripId={7} visitId={31} client={transport.client} />
      </QueryClientProvider>
    </I18nextProvider>
  );
  const notes = await screen.findByLabelText('Visit notes');
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2029' } });
  fireEvent.change(screen.getByLabelText('Month'), { target: { value: '13' } });
  transport.patchReplies.push({
    status: 503,
    body: { code: 'trips.unavailable', message: 'Unavailable', retryable: true },
  });
  fireEvent.change(notes, { target: { value: 'Failed draft' } });
  fireEvent.blur(notes);
  await screen.findByText('Changes have not been saved');
  failRead = true;
  fireEvent.click(screen.getByRole('button', { name: 'Reload visit' }));
  await waitFor(() => expect(rejectedReads).toBe(1));
  expect(screen.getByLabelText('Visit notes')).toHaveValue('Failed draft');
  expect(screen.getByLabelText('Month')).toHaveValue(13);
  expect(screen.getByText('Changes have not been saved')).toBeInTheDocument();
  failRead = false;
  transport.setSource(sourceVisit({ revision: 2, notes: 'Canonical reload', timing: {} }));
  fireEvent.click(screen.getByRole('button', { name: 'Reload visit' }));
  await waitFor(() => expect(screen.getByLabelText('Visit notes')).toHaveValue('Canonical reload'));
  expect(screen.getByLabelText('Month')).toHaveValue(null);
  expect(screen.queryByText('Changes have not been saved')).not.toBeInTheDocument();
  expect(transport.patches).toEqual([{ notes: 'Failed draft', expectedRevision: 0 }]);
  cache.clear();
});
