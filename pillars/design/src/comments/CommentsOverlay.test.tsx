/**
 * What a reviewer sees when comment mode cannot work, told apart by cause.
 *
 * The deployed design API answers 403 to a browser that reached capivara over
 * the LAN or tailscale, because that request carries no Cloudflare Access
 * assertion. Before, the overlay rendered nothing for that exactly as it does
 * for a local checkout with no API at all, so the comment button toggled a
 * mode that drew nothing and named no cause.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommentsOverlay } from './CommentsOverlay';

function renderOverlay(active = true) {
  return render(
    <CommentsOverlay
      active={active}
      route="/s/finance/import-review"
      themeKey="default"
      onOpenCountChange={() => {}}
      onExit={() => {}}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CommentsOverlay — when the comment API cannot be used', () => {
  it('says why when the API refuses this caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 403 }))
    );

    renderOverlay();

    expect(await screen.findByRole('status')).toHaveTextContent(/refused this address/u);
  });

  it('stays absent when the API did not answer at all', async () => {
    // The local-checkout case: no API, and nothing to explain.
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderOverlay();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('status')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing while comment mode is off, even when refused', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    renderOverlay(false);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
