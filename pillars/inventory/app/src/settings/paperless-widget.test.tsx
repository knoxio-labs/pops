import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ paperlessStatus: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  paperlessStatus: (...args: unknown[]) => api.paperlessStatus(...args),
}));

import { PaperlessWidget } from './paperless-widget';

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaperlessWidget />
    </QueryClientProvider>
  );
}

describe('PaperlessWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('explains the unconfigured state without offering a pointless test', async () => {
    api.paperlessStatus.mockResolvedValue(
      ok({
        data: { configured: false, available: false, baseUrl: null, documentCount: null },
      })
    );

    renderWidget();

    expect(await screen.findByText('Not set up')).toBeInTheDocument();
    expect(
      screen.getByText('No API token stored yet. Add one on the server; it is never shown here.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
  });

  it('shows Paperless-down state and leaves the retry action enabled', async () => {
    api.paperlessStatus.mockResolvedValue(
      ok({
        data: {
          configured: true,
          available: false,
          baseUrl: 'https://paperless.example',
          documentCount: null,
        },
      })
    );

    renderWidget();

    expect(await screen.findByText('Paperless unreachable')).toBeInTheDocument();
    expect(screen.getByText(/Documents show as unavailable until it answers/)).toBeInTheDocument();
    expect(
      screen.getByText('An API token is stored on the server. It is never shown here.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();

    await waitFor(() => expect(api.paperlessStatus).toHaveBeenCalled());
  });
});
