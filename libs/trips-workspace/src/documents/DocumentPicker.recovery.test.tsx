import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import { DocumentPicker } from './DocumentPicker';
import { TripDocumentUploadContextError } from './upload-context';
import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';

import type { DocumentPickerProps } from './DocumentPicker';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

function harness() {
  const requests: string[] = [];
  let parentValid = true;
  const client = createClient({
    baseUrl: 'https://owner.example/documents-api',
    fetch: vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request.url);
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
              title: 'Owner original',
              originalFileName: 'same.pdf',
              created: '',
              thumbnailUrl: '',
            },
          ],
        });
      throw new Error('Unexpected owner request');
    }),
  });
  const selected = vi.fn<DocumentPickerProps['onSelected']>();
  function Recovery() {
    const [session, setSession] = useState(() =>
      createDocumentUploadSession(new File(['file'], 'same.pdf', { type: 'application/pdf' }))
    );
    const [pickerOpen, setPickerOpen] = useState(true);
    const controller = useDocumentUpload({
      session,
      onSessionChange: setSession,
      documentsClient: client,
      beforeRequest: () => {
        if (!parentValid) throw new TripDocumentUploadContextError();
      },
    });
    return controller.fields.uncertain ? (
      <DocumentPicker
        documentsClient={client}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialSearch="same"
        beforeRequest={controller.assertOwnerContext}
        onSelected={selected}
      />
    ) : (
      <button disabled={controller.unavailable} onClick={controller.actions.submitUpload}>
        Send
      </button>
    );
  }
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <Recovery />
    </QueryClientProvider>
  );
  return {
    client,
    selected,
    requests,
    invalidateParent: () => {
      parentValid = false;
    },
  };
}

async function closeRecoveryPicker(): Promise<void> {
  const dialog = screen.queryByRole('dialog');
  if (dialog === null) return;
  const search = within(dialog).getByRole('textbox');
  search.focus();
  expect(search).toHaveFocus();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Choose existing document' })).toHaveFocus()
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
}

it.each(['owner', 'parent'])(
  'fences standalone recovery picker search and cached selection after the %s context changes',
  async (changedContext) => {
    const owner = harness();
    try {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
      await userEvent.click(screen.getByRole('button', { name: 'Send' }));
      await screen.findByRole('button', { name: 'Choose' });
      if (changedContext === 'owner')
        owner.client.setConfig({ baseUrl: 'https://other.example/documents-api' });
      else owner.invalidateParent();
      const requestsBefore = owner.requests.length;
      await userEvent.click(screen.getByRole('button', { name: 'Choose' }));
      expect(
        await screen.findByText('This original could not be selected. Retry your selection.')
      ).toHaveAttribute('role', 'alert');
      expect(owner.selected).not.toHaveBeenCalled();
      fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
        target: { value: 'other' },
      });
      await screen.findByText('Documents search failed. Try again.');
      expect(owner.requests).toHaveLength(requestsBefore);
      expect(screen.getByRole('dialog')).toBeVisible();
    } finally {
      await closeRecoveryPicker();
    }
  }
);
