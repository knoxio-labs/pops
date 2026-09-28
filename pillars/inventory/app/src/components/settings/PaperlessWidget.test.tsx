import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ paperlessStatus: vi.fn() }));

vi.mock('../../inventory-api/index.js', () => ({
  paperlessStatus: (...args: unknown[]) => api.paperlessStatus(...args),
}));

import { PAPERLESS_STATUS_QUERY_KEY } from '../../inventory-web/usePaperlessStatus';
import { PaperlessWidget, paperlessWidgetState } from './PaperlessWidget';

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <PaperlessWidget />
    </QueryClientProvider>
  );
  return { ...result, queryClient };
}

describe('PaperlessWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('shows not set up, connected, and unreachable states from the shared status', async () => {
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

    cleanup();
    api.paperlessStatus.mockResolvedValue(
      ok({
        data: {
          configured: true,
          available: true,
          baseUrl: 'https://paperless.example',
          documentCount: 1234,
        },
      })
    );
    renderWidget();
    expect(await screen.findByText('Connected, 1,234 documents')).toBeInTheDocument();
    expect(
      screen.getByText('An API token is stored on the server. It is never shown here.')
    ).toBeInTheDocument();

    cleanup();
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
  });

  it('refetches on Test connection and disables the action while testing', async () => {
    api.paperlessStatus
      .mockResolvedValueOnce(
        ok({
          data: {
            configured: true,
            available: true,
            baseUrl: 'https://paperless.example',
            documentCount: 5,
          },
        })
      )
      .mockReturnValueOnce(new Promise(() => {}));

    renderWidget();
    const button = await screen.findByRole('button', { name: 'Test connection' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Testing' })).toBeDisabled();
    expect(api.paperlessStatus).toHaveBeenCalledTimes(2);
  });

  it('disables Test connection while offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
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

    const button = await screen.findByRole('button', { name: 'Test connection' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'No connection. Changes are off until it is back.');
  });

  it('shows the testing line during the first read and nothing after a failed read', async () => {
    api.paperlessStatus.mockReturnValueOnce(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText('Testing the connection')).toBeInTheDocument();
    expect(screen.getByText('Asking Paperless for its document count.')).toBeInTheDocument();
    expect(screen.queryByText('Not set up')).not.toBeInTheDocument();
    expect(screen.queryByText(/API token stored/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    cleanup();
    api.paperlessStatus.mockRejectedValueOnce(new Error('offline'));
    renderWidget();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByText('Not set up')).not.toBeInTheDocument();
    expect(screen.queryByText('Paperless unreachable')).not.toBeInTheDocument();
  });

  it('keeps the not-set-up state during a background refetch', () => {
    const checkedAt = new Date('2026-09-28T05:00:00.000Z');
    expect(
      paperlessWidgetState(
        { configured: false, available: false, baseUrl: null, documentCount: null },
        true,
        checkedAt
      )
    ).toEqual({ kind: 'not-set-up' });
  });

  it('stores the response envelope under the shared status key', async () => {
    const response = ok({
      data: { configured: false, available: false, baseUrl: null, documentCount: null },
    });
    api.paperlessStatus.mockResolvedValue(response);
    const { queryClient } = renderWidget();
    await screen.findByText('Not set up');
    expect(queryClient.getQueryData(PAPERLESS_STATUS_QUERY_KEY)).toEqual(response.data);
  });
});
