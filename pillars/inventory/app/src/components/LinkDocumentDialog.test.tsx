import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ReactElement } from 'react';

const paperlessSearchMock = vi.hoisted(() => vi.fn());
const documentsLinkMock = vi.hoisted(() => vi.fn());

vi.mock('../inventory-api/index.js', () => ({
  documentsLink: (...args: unknown[]) => documentsLinkMock(...args),
  paperlessSearch: (...args: unknown[]) => paperlessSearchMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { LinkDocumentDialog } from './LinkDocumentDialog';

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('LinkDocumentDialog', () => {
  it('disables the trigger and explains a Paperless outage', () => {
    renderWithProviders(
      <LinkDocumentDialog
        itemId="item-1"
        onLinked={vi.fn()}
        disabledReason="Paperless-ngx is unavailable."
      />
    );

    const trigger = screen.getByRole('button', {
      name: 'Link Document (Paperless-ngx is unavailable.)',
    });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', 'Paperless-ngx is unavailable.');
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the trigger actionable when Paperless is available', () => {
    renderWithProviders(<LinkDocumentDialog itemId="item-1" onLinked={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Link Document' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Link Document' })).toBeInTheDocument();
  });

  it('shows search failures distinctly and retries the current search', async () => {
    paperlessSearchMock.mockReset();
    paperlessSearchMock
      .mockRejectedValueOnce(new Error('Paperless is unavailable'))
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 1,
              title: 'Manual',
              created: '2026-09-30',
              originalFileName: 'manual.pdf',
              thumbnailUrl: '',
            },
          ],
        },
        error: undefined,
        response: { status: 200 },
      });

    renderWithProviders(<LinkDocumentDialog itemId="item-1" onLinked={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Link Document' }));
    fireEvent.change(screen.getByPlaceholderText('Search documents...'), {
      target: { value: 'manual' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Paperless search failed. Try again.'
    );
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Manual')).toBeInTheDocument();
    expect(paperlessSearchMock).toHaveBeenCalledTimes(2);
  });

  it('uses a caller-provided trigger', () => {
    renderWithProviders(
      <LinkDocumentDialog
        itemId="item-1"
        onLinked={vi.fn()}
        trigger={<button type="button">Custom link</button>}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom link' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
