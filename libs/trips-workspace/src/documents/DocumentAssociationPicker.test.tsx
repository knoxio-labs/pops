import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { associatePaperlessDocument, searchPaperlessDocuments } from './api';
import { DocumentAssociationPicker } from './DocumentAssociationPicker';

vi.mock('./api', () => ({
  associatePaperlessDocument: vi.fn(),
  searchPaperlessDocuments: vi.fn(),
}));

const search = vi.mocked(searchPaperlessDocuments);
const associate = vi.mocked(associatePaperlessDocument);
const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.resetAllMocks();
});

function mount(onAssociated?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <DocumentAssociationPicker
        tripId={4}
        target={{ kind: 'visit', id: 8 }}
        onAssociated={onAssociated}
      />
    </QueryClientProvider>
  );
}

describe('DocumentAssociationPicker', () => {
  it('keeps search failures distinct from empty results and retries the same query', async () => {
    const user = userEvent.setup();
    search.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([
      {
        id: 21,
        title: 'Train ticket',
        created: '2026-11-09',
        originalFileName: 'ticket.pdf',
        thumbnailUrl: '',
      },
    ]);
    mount();
    await user.click(screen.getByRole('button', { name: 'Choose existing document' }));
    fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
      target: { value: 'ticket' },
    });
    expect(await screen.findByText('Documents search failed. Try again.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Train ticket')).toBeVisible();
    expect(search).toHaveBeenLastCalledWith('ticket', undefined);
  });

  it('retains the chosen original and target after an association write fails', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([
      {
        id: 21,
        title: 'Train ticket',
        created: '2026-11-09',
        originalFileName: 'ticket.pdf',
        thumbnailUrl: '',
      },
    ]);
    associate.mockRejectedValue(new Error('write failed'));
    mount();
    await user.click(screen.getByRole('button', { name: 'Choose existing document' }));
    fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
      target: { value: 'ticket' },
    });
    await user.click(await screen.findByRole('button', { name: 'Link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This original could not be linked');
    expect(associate).toHaveBeenCalledWith(4, 21, { kind: 'visit', id: 8 }, undefined);
    expect(screen.getByText('Train ticket')).toBeVisible();
  });

  it('treats an existing association conflict as a completed idempotent selection', async () => {
    const user = userEvent.setup();
    const onAssociated = vi.fn();
    search.mockResolvedValue([
      {
        id: 21,
        title: 'Train ticket',
        created: '2026-11-09',
        originalFileName: 'ticket.pdf',
        thumbnailUrl: '',
      },
    ]);
    associate.mockRejectedValue(
      new ApiError({
        code: 'trips.document.association_exists',
        kind: 'client',
        message: 'Already linked',
        retryable: false,
        status: 409,
      })
    );
    mount(onAssociated);
    await user.click(screen.getByRole('button', { name: 'Choose existing document' }));
    fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
      target: { value: 'ticket' },
    });
    await user.click(await screen.findByRole('button', { name: 'Link' }));

    await waitFor(() => expect(onAssociated).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
