import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const healthMock = vi.hoisted(() => vi.fn());

vi.mock('../../bfm-api/index.js', () => ({
  health: (...args: unknown[]) => healthMock(...args),
}));

import { DevicesPage } from '../DevicesPage';

/**
 * The page is deliberately NOT mocked below the SDK boundary: `unwrap` and
 * `isUnavailableError` run for real, so these cases pin the classification
 * the Devices page (POPS-1387) inherits, not just the rendering.
 */
function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DevicesPage />
    </QueryClientProvider>
  );
}

/**
 * The badge is present from first paint (it renders the `loading` state), so
 * `findByRole` alone resolves before the query settles and would assert
 * against the placeholder. Poll until it leaves `loading` instead — RTL's
 * auto-waiting, no fixed delay.
 */
function settledBadge(): Promise<HTMLElement> {
  return waitFor(() => {
    const badge = screen.getByRole('status');
    if (badge.dataset.reachability === 'loading') {
      throw new Error('reachability still loading');
    }
    return badge;
  });
}

const HEALTHY = {
  data: { ok: true, status: 'ok', pillar: 'bfm', version: 'dev', ts: '2026-08-08T00:00:00Z' },
};

beforeEach(() => {
  healthMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('DevicesPage', () => {
  it('renders the Devices heading and the pending-work note', async () => {
    healthMock.mockResolvedValue(HEALTHY);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument();
    expect(screen.getByText('Pairing and revocation land here next.')).toBeInTheDocument();
  });

  it('shows the loading state while /health is still in flight', async () => {
    healthMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    const badge = await screen.findByRole('status');
    expect(badge).toHaveAttribute('data-reachability', 'loading');
    expect(badge).toHaveTextContent('Checking…');
  });

  it('reports the pillar reachable when /health answers', async () => {
    healthMock.mockResolvedValue(HEALTHY);
    renderPage();

    const badge = await settledBadge();
    expect(badge).toHaveAttribute('data-reachability', 'reachable');
    expect(badge).toHaveTextContent('Reachable');
  });

  it('calls the generated health operation exactly once', async () => {
    healthMock.mockResolvedValue(HEALTHY);
    renderPage();

    await settledBadge();
    expect(healthMock).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when the pillar answers 5xx', async () => {
    healthMock.mockResolvedValue({
      error: { message: 'bfm down' },
      response: new Response(null, { status: 503 }),
    });
    renderPage();

    const badge = await settledBadge();
    expect(badge).toHaveAttribute('data-reachability', 'unavailable');
    expect(badge).toHaveTextContent('Unavailable');
  });

  it('reports unavailable when the request never reached the pillar', async () => {
    healthMock.mockResolvedValue({ error: { message: 'network down' } });
    renderPage();

    expect(await settledBadge()).toHaveAttribute('data-reachability', 'unavailable');
  });

  // A 404 here means the proxy or nginx route is wrong, not that bfm is down.
  // Rendering "Unavailable" for it would send the operator after the wrong bug.
  it('distinguishes a refusal that carried a status from an unreachable pillar', async () => {
    healthMock.mockResolvedValue({
      error: { message: 'no route' },
      response: new Response(null, { status: 404 }),
    });
    renderPage();

    const badge = await settledBadge();
    expect(badge).toHaveAttribute('data-reachability', 'error');
    expect(badge).toHaveTextContent('Refused the request');
  });

  it('treats an empty 200 body as a failure rather than reachable', async () => {
    healthMock.mockResolvedValue({ response: new Response(null, { status: 200 }) });
    renderPage();

    expect(await settledBadge()).toHaveAttribute('data-reachability', 'error');
  });
});
