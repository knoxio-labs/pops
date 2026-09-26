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
});
