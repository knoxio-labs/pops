import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { associatePaperlessDocument, searchPaperlessDocuments } from './api';
import { DocumentPicker } from './DocumentPicker';

import type { DocumentPickerProps } from './DocumentPicker';
import type { PaperlessSearchDocument } from './types';

vi.mock('./api', () => ({
  associatePaperlessDocument: vi.fn(),
  searchPaperlessDocuments: vi.fn(),
}));
const caches: QueryClient[] = [];
const document: PaperlessSearchDocument = {
  id: 21,
  title: 'Actual original',
  originalFileName: 'same.pdf',
  created: '',
  thumbnailUrl: '',
};

afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
});

function mount(onSelected: DocumentPickerProps['onSelected']): void {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <DocumentPicker onSelected={onSelected} />
    </QueryClientProvider>
  );
}

async function searchOriginal(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Choose existing document' }));
  fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
    target: { value: 'same' },
  });
}

describe('DocumentPicker owner selection', () => {
  it('returns the actual owner object through the callback without creating a Trips association', async () => {
    vi.mocked(searchPaperlessDocuments).mockResolvedValue([document]);
    const onSelected = vi.fn<DocumentPickerProps['onSelected']>();
    mount(onSelected);
    await searchOriginal();
    await userEvent.click(await screen.findByRole('button', { name: 'Choose' }));
    await waitFor(() => expect(onSelected).toHaveBeenCalledOnce());
    expect(onSelected.mock.calls[0]?.[0]).toBe(document);
    expect(associatePaperlessDocument).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Choose existing document' })).toHaveFocus()
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retains the owner selection after a rejected callback and retries only that callback', async () => {
    vi.mocked(searchPaperlessDocuments).mockResolvedValue([document]);
    const onSelected = vi
      .fn<DocumentPickerProps['onSelected']>()
      .mockRejectedValueOnce(new Error('consumer unavailable'))
      .mockResolvedValue(undefined);
    mount(onSelected);
    await searchOriginal();
    await userEvent.click(await screen.findByRole('button', { name: 'Choose' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This original could not be selected'
    );
    expect(screen.getByText('Actual original')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Choose' }));
    await waitFor(() => expect(onSelected).toHaveBeenCalledTimes(2));
    expect(onSelected.mock.calls[1]?.[0]).toBe(document);
    expect(associatePaperlessDocument).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Choose existing document' })).toHaveFocus()
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
