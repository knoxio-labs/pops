import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const issuePairingCodeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../bfm-api/index.js', () => ({
  operatorIssuePairingCode: (...args: unknown[]) => issuePairingCodeMock(...args),
}));

import { usePairingCode } from '../usePairingCode';

import type { ReactElement, ReactNode } from 'react';

/**
 * Driven through the hook rather than the page because the property under test
 * is *invisible* from the DOM: once the dialog is shut nothing renders either
 * way, so a page-level assertion cannot tell a dropped code from one still sat
 * in state with a countdown running against it.
 */
function renderPairing() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePairingCode(), { wrapper });
}

/** The two shapes the generated SDK settles with. */
type SdkResult =
  | { data: { code: string; pairingUrl: string; expiresAt: string } }
  | { error: { message: string }; response: Response };

/** A promise whose settlement this test controls. */
function deferred(): { promise: Promise<SdkResult>; settle: (value: SdkResult) => void } {
  let settle!: (value: SdkResult) => void;
  const promise = new Promise<SdkResult>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function codeExpiringIn(ms: number, code = '7QK4-9M2X-P3ND'): SdkResult {
  return {
    data: {
      code,
      pairingUrl: `https://bfm.example.com/devices/pair?code=${code}`,
      expiresAt: new Date(Date.now() + ms).toISOString(),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
  issuePairingCodeMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePairingCode — a dismissed mint stays dismissed', () => {
  it('drops a code that arrives after the operator closed the dialog', async () => {
    const inFlight = deferred();
    issuePairingCodeMock.mockReturnValue(inFlight.promise);

    const { result } = renderPairing();

    act(() => result.current.mint());
    await waitFor(() => expect(result.current.state).toBe('minting'));

    act(() => result.current.dismiss());

    await act(async () => {
      inFlight.settle(codeExpiringIn(300_000));
      await inFlight.promise;
    });

    expect(result.current.issued).toBeNull();
    expect(result.current.state).toBe('idle');
    expect(result.current.remainingMs).toBe(0);
  });

  it('drops a failure that arrives after the operator closed the dialog', async () => {
    const inFlight = deferred();
    issuePairingCodeMock.mockReturnValue(inFlight.promise);

    const { result } = renderPairing();

    act(() => result.current.mint());
    await waitFor(() => expect(result.current.state).toBe('minting'));

    act(() => result.current.dismiss());

    await act(async () => {
      inFlight.settle({
        error: { message: 'bfm down' },
        response: new Response(null, { status: 503 }),
      });
      await inFlight.promise;
    });

    expect(result.current.failure).toBeNull();
    expect(result.current.state).toBe('idle');
  });

  /**
   * The operator dismisses one code and immediately mints another. The first
   * response must not overwrite the second — the QR on screen would then point
   * at a code the server no longer considers current.
   */
  it('keeps the newest code when a superseded request lands last', async () => {
    const first = deferred();
    const second = deferred();
    issuePairingCodeMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderPairing();

    act(() => result.current.mint());
    act(() => result.current.dismiss());
    act(() => result.current.mint());

    await act(async () => {
      second.settle(codeExpiringIn(300_000, 'AAAA-BBBB-CCCC'));
      await second.promise;
    });
    await waitFor(() => expect(result.current.issued?.code).toBe('AAAA-BBBB-CCCC'));

    await act(async () => {
      first.settle(codeExpiringIn(300_000));
      await first.promise;
    });

    expect(result.current.issued?.code).toBe('AAAA-BBBB-CCCC');
  });

  it('still delivers a code when nothing dismissed it', async () => {
    issuePairingCodeMock.mockResolvedValue(codeExpiringIn(300_000));

    const { result } = renderPairing();

    act(() => result.current.mint());

    await waitFor(() => expect(result.current.state).toBe('issued'));
    expect(result.current.issued?.code).toBe('7QK4-9M2X-P3ND');
  });
});
