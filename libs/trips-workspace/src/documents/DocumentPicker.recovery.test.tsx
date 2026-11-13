import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DocumentPicker } from './DocumentPicker';
import {
  createDurableUploadWire,
  readableUploadFile,
  uploadWebCrypto,
} from './durable-upload-wire-test-utils';
import { TripDocumentUploadContextError } from './upload-context';
import { useDocumentUpload } from './useDocumentUpload';
import { createDocumentUploadSession } from './useUploadFields';

import type { DocumentPickerProps } from './DocumentPicker';

const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal('crypto', uploadWebCrypto);
});
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.unstubAllGlobals();
});

function harness() {
  const wire = createDurableUploadWire({
    searchResults: [
      {
        id: 91,
        title: 'Owner original',
        originalFileName: 'same.pdf',
        created: '2026-01-01T00:00:00.000Z',
        thumbnailUrl: '',
      },
    ],
  });
  let parentValid = true;
  const selected = vi.fn<DocumentPickerProps['onSelected']>();
  function Recovery() {
    const [session, setSession] = useState(() =>
      createDocumentUploadSession(readableUploadFile('file', 'same.pdf'))
    );
    const [pickerOpen, setPickerOpen] = useState(false);
    const controller = useDocumentUpload({
      session,
      onSessionChange: setSession,
      documentsClient: wire.client,
      journal: wire.persistence.journal,
      beforeRequest: () => {
        if (!parentValid) throw new TripDocumentUploadContextError();
      },
    });
    return controller.fields.uncertain ? (
      <>
        <button
          disabled={controller.fields.uploadPending}
          onClick={controller.actions.recoverSelection}
        >
          Check upload status
        </button>
        <button disabled={controller.fields.uploadPending} onClick={() => setPickerOpen(true)}>
          Choose existing original
        </button>
        <DocumentPicker
          documentsClient={wire.client}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          beforeRequest={controller.assertOwnerContext}
          onSelected={selected}
        />
      </>
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
    ...wire,
    selected,
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
  'fences explicit standalone picker search and cached selection after the %s context changes',
  async (changedContext) => {
    const owner = harness();
    const user = userEvent.setup();
    try {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
      await user.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(owner.dispatches).toHaveLength(1));
      const dispatch = owner.dispatches[0];
      if (dispatch === undefined) throw new Error('Captured durable dispatch missing.');
      await act(async () => dispatch.fail(new Error('Acceptance response lost')));
      const status = await screen.findByRole('button', { name: 'Check upload status' });
      await waitFor(() => expect(status).toBeEnabled());
      await user.click(status);
      await waitFor(() =>
        expect(
          owner.requests.some(
            (request) =>
              request.method === 'GET' &&
              request.url.endsWith(`/uploads/${dispatch.input.operationId}`)
          )
        ).toBe(true)
      );
      const existing = screen.getByRole('button', { name: 'Choose existing original' });
      await waitFor(() => expect(existing).toBeEnabled());
      expect(owner.dispatchCount()).toBe(1);
      expect(owner.requests.some((request) => request.url.includes('/paperless/search'))).toBe(
        false
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(existing);
      fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
        target: { value: 'existing booking' },
      });
      await screen.findByRole('button', { name: 'Choose' });
      if (changedContext === 'owner')
        owner.client.setConfig({ baseUrl: 'https://other.example/documents-api' });
      else owner.invalidateParent();
      const requestsBefore = owner.requests.length;
      await user.click(screen.getByRole('button', { name: 'Choose' }));
      expect(
        await screen.findByText('This original could not be selected. Retry your selection.')
      ).toHaveAttribute('role', 'alert');
      expect(owner.selected).not.toHaveBeenCalled();
      fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
        target: { value: 'other' },
      });
      await screen.findByText('Documents search failed. Try again.');
      expect(owner.requests).toHaveLength(requestsBefore);
      expect(owner.dispatchCount()).toBe(1);
      expect(screen.getByRole('dialog')).toBeVisible();
    } finally {
      await closeRecoveryPicker();
    }
  }
);
