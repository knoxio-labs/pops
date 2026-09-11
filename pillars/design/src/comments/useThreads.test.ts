/**
 * Why the comment API is unavailable, not only whether it is.
 *
 * Reached over the LAN or tailscale, capivara's design API is up but the
 * request carries no Cloudflare Access assertion, so the identity ladder
 * resolves it anonymous and `/me` answers 403. Before this distinction the
 * overlay treated that exactly like an API that never answered and hid itself,
 * so the dock's comment button toggled a mode that drew nothing, with nothing
 * on screen naming the cause.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useThreads } from './useThreads';

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useThreads — why comments are unavailable', () => {
  it('says the API refused the caller when /me answers 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(403, { message: 'Forbidden' }))
    );

    const { result } = renderHook(() => useThreads('/route'));

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.unavailableReason).toBe('refused');
  });

  it('says the API did not answer when the request itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const { result } = renderHook(() => useThreads('/route'));

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.unavailableReason).toBe('unreachable');
  });

  it('treats a non-403 error status as not answering, not as a refusal', async () => {
    // A 502 from the shell's proxy is the API being down, not the ladder
    // deciding against this caller.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(502, {}))
    );

    const { result } = renderHook(() => useThreads('/route'));

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.unavailableReason).toBe('unreachable');
  });

  it('reports no reason once the API has vouched for the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/me')
          ? respond(200, { email: 'someone@knoxio.dev' })
          : respond(200, { threads: [] })
      )
    );

    const { result } = renderHook(() => useThreads('/route'));

    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.unavailableReason).toBeNull();
  });
});
