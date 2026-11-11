import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import { CaptureBrowserSession } from './browser-session';
import { CaptureUpload } from './CaptureUpload';
import { captureResult, captureSource } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

it('keeps ambiguous upload recovery bound to its Documents owner without losing the selected File', async () => {
  const user = userEvent.setup();
  const requests: Request[] = [];
  const origin = 'https://owner.example/documents-api';
  const client = createClient({
    baseUrl: origin,
    fetch: vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      if (request.method === 'POST') throw new Error('Acceptance response lost');
      if (request.url.endsWith('/paperless/status'))
        return Response.json({
          data: {
            configured: true,
            available: true,
            maxUploadBytes: 1000,
            allowedMimeTypes: ['application/pdf'],
          },
        });
      if (request.url.includes('/paperless/search'))
        return Response.json({
          data: [
            {
              id: 91,
              title: 'Actual owner original',
              originalFileName: 'same.pdf',
              created: '',
              thumbnailUrl: '',
            },
          ],
        });
      throw new Error('Unexpected owner request');
    }),
  });
  const session = new CaptureBrowserSession(captureSource(), 1, async (request) =>
    captureResult(request)
  );
  const file = new File(['original bytes'], 'same.pdf', { type: 'application/pdf' });
  session.addFile(file);
  const selection = session.editor.getState().draft.selections[0];
  if (selection === undefined) throw new Error('Missing file selection');
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <CaptureUpload
        session={session}
        selection={selection}
        documentsClient={client}
        locked={false}
      />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send to Documents' })).toBeEnabled()
  );
  await user.click(screen.getByRole('button', { name: 'Send to Documents' }));
  await user.click(await screen.findByRole('button', { name: 'Search Documents for same.pdf' }));
  await screen.findByRole('button', { name: 'Choose' });
  client.setConfig({ baseUrl: 'https://other.example/documents-api' });
  const requestCount = requests.length;
  await user.click(screen.getByRole('button', { name: 'Choose' }));
  expect(
    await screen.findByText('This original could not be selected. Retry your selection.')
  ).toBeVisible();
  expect(session.editor.getState().draft.selections[0]?.references).toEqual([]);
  expect(session.upload(selection.id)?.file).toBe(file);
  expect(session.upload(selection.id)?.uncertain).toBe(true);
  expect(requests).toHaveLength(requestCount);
  client.setConfig({ baseUrl: origin });
  await user.clear(screen.getByRole('textbox', { name: 'Search documents...' }));
  await user.type(screen.getByRole('textbox', { name: 'Search documents...' }), 'same');
  await user.click(await screen.findByRole('button', { name: 'Choose' }));
  await waitFor(() =>
    expect(session.editor.getState().draft.selections[0]?.references).toEqual([
      { kind: 'document', documentId: 91 },
    ])
  );
  expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  expect(session.upload(selection.id)?.file).toBe(file);
});
