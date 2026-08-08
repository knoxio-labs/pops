import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeQrSvg } from '@pops/ui/testing/decode-qr';

const listDevicesMock = vi.hoisted(() => vi.fn());
const issuePairingCodeMock = vi.hoisted(() => vi.fn());
const revokeDeviceMock = vi.hoisted(() => vi.fn());

vi.mock('../../bfm-api/index.js', () => ({
  operatorListDevices: (...args: unknown[]) => listDevicesMock(...args),
  operatorIssuePairingCode: (...args: unknown[]) => issuePairingCodeMock(...args),
  operatorRevokeDevice: (...args: unknown[]) => revokeDeviceMock(...args),
}));

import { DevicesPage } from '../DevicesPage';

/**
 * Mocked at the generated-SDK boundary and no lower: `unwrap` and
 * `isUnavailableError` run for real, so these cases pin the classification the
 * page acts on rather than a stand-in for it.
 */
function renderPage(): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DevicesPage />
    </QueryClientProvider>
  );
  return user;
}

const PAIRING_URL = 'https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND';

function issuedCode(expiresInMs: number) {
  return {
    data: {
      code: '7QK4-9M2X-P3ND',
      pairingUrl: PAIRING_URL,
      expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    },
  };
}

function device(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dev-1',
    name: "Joao's iPhone",
    model: 'iPhone 17 Pro',
    createdAt: '2026-08-01T10:00:00.000Z',
    lastSeenAt: '2026-08-08T09:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

function devicesResponse(...devices: ReturnType<typeof device>[]) {
  return { data: { devices } };
}

function errorResponse(status: number | undefined, message: string) {
  return status === undefined
    ? { error: { message } }
    : { error: { message }, response: new Response(null, { status }) };
}

function readRemainingSeconds(): number {
  const readout = screen.getByRole('timer').textContent ?? '';
  const [, minutes, seconds] = /(\d+):(\d{2})$/.exec(readout) ?? [];
  if (minutes === undefined || seconds === undefined) {
    throw new Error(`the TTL readout is not m:ss — got "${readout}"`);
  }
  return Number(minutes) * 60 + Number(seconds);
}

function pairingQr(): SVGElement {
  const svg = within(screen.getByRole('dialog')).getByRole('img');
  if (!(svg instanceof SVGElement)) throw new Error('the pairing dialog rendered no QR');
  return svg;
}

/**
 * `shouldAdvanceTime` is load-bearing: React Query settles on macrotasks, and
 * a fully frozen clock deadlocks every `findBy*` in this file. The cost is
 * that real elapsed milliseconds leak into the fake clock, so the countdown
 * readout can straddle a second boundary — which is why the assertions below
 * measure how far it moved rather than pinning an exact string. Exact
 * formatting is pinned in `devices-page/__tests__/pairing-ttl.test.ts`, where
 * the clock is a parameter rather than a timer.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
  listDevicesMock.mockReset().mockResolvedValue(devicesResponse());
  issuePairingCodeMock.mockReset().mockResolvedValue(issuedCode(300_000));
  revokeDeviceMock.mockReset().mockResolvedValue({
    data: { id: 'dev-1', revokedAt: '2026-08-08T12:00:00.000Z', alreadyRevoked: false },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DevicesPage — the device list', () => {
  it('lists a paired device with its model, pairing date and state', async () => {
    listDevicesMock.mockResolvedValue(devicesResponse(device()));
    renderPage();

    const row = await screen.findByRole('row', { name: /Joao's iPhone/ });
    expect(within(row).getByText('iPhone 17 Pro')).toBeInTheDocument();
    expect(within(row).getByText('1 Aug 2026')).toBeInTheDocument();
    expect(within(row).getByText('Trusted')).toBeInTheDocument();
  });

  it('marks a revoked device and offers no way to revoke it again', async () => {
    listDevicesMock.mockResolvedValue(
      devicesResponse(device({ revokedAt: '2026-08-07T08:00:00.000Z' }))
    );
    renderPage();

    const row = await screen.findByRole('row', { name: /Joao's iPhone/ });
    expect(row).toHaveAttribute('data-revoked', 'true');
    expect(within(row).getByText('Revoked 7 Aug 2026')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing is paired yet', async () => {
    renderPage();

    expect(await screen.findByText('No devices paired')).toBeInTheDocument();
  });

  /**
   * The two failure paths must stay distinguishable: "bfm is down" and "bfm
   * refused you" send the operator after entirely different bugs, and the
   * `isUnavailableError` helper is what keeps them apart.
   */
  it('reports the pillar unavailable when the list request never landed', async () => {
    listDevicesMock.mockResolvedValue(errorResponse(undefined, 'network down'));
    renderPage();

    expect(
      await screen.findByText(/did not answer\. Check that the pillar is running/)
    ).toBeInTheDocument();
  });

  it('reports the pillar unavailable on a 5xx', async () => {
    listDevicesMock.mockResolvedValue(errorResponse(503, 'bfm down'));
    renderPage();

    expect(await screen.findByText(/did not answer\./)).toBeInTheDocument();
  });

  /**
   * The list is not metered today, so this cannot fire against the current
   * server. It is asserted anyway because the failure mode is silent: folding
   * a 429 into "refused" would tell the operator to go check their Cloudflare
   * Access session the day anyone meters this route.
   */
  it('keeps a 429 distinct from a refusal rather than folding the two together', async () => {
    listDevicesMock.mockResolvedValue(errorResponse(429, 'slow down'));
    renderPage();

    expect(await screen.findByText(/Wait a moment and reload/)).toBeInTheDocument();
    expect(screen.queryByText(/Cloudflare Access session/)).not.toBeInTheDocument();
  });

  it('does not call a 401 "unavailable" — that is a lapsed Access session', async () => {
    listDevicesMock.mockResolvedValue(errorResponse(401, 'no principal'));
    renderPage();

    expect(await screen.findByText(/Cloudflare Access session/)).toBeInTheDocument();
    expect(screen.queryByText(/did not answer/)).not.toBeInTheDocument();
  });
});

describe('DevicesPage — minting a pairing code', () => {
  it('mints on open and encodes exactly the pairingUrl the endpoint returned', async () => {
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));

    await screen.findByTestId('pairing-code');
    expect(issuePairingCodeMock).toHaveBeenCalledTimes(1);
    expect(decodeQrSvg(pairingQr())).toBe(PAIRING_URL);
  });

  /**
   * The QR must carry the URL, not the bare code: the handset ships without a
   * hostname and learns where its bfm lives from what it scans. Encoding the
   * code alone produces a QR that scans perfectly and pairs nothing.
   */
  it('encodes the URL rather than the bare code', async () => {
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    await screen.findByTestId('pairing-code');

    expect(decodeQrSvg(pairingQr())).not.toBe('7QK4-9M2X-P3ND');
    expect(decodeQrSvg(pairingQr())).toContain('/devices/pair?code=');
  });

  it('shows the code as readable text alongside the QR', async () => {
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));

    expect(await screen.findByTestId('pairing-code')).toHaveTextContent('7QK4-9M2X-P3ND');
  });

  it('counts the remaining TTL down', async () => {
    issuePairingCodeMock.mockResolvedValue(issuedCode(125_000));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    await screen.findByTestId('pairing-code');

    const before = readRemainingSeconds();
    expect(before).toBeGreaterThan(120);
    expect(before).toBeLessThanOrEqual(125);

    await vi.advanceTimersByTimeAsync(60_000);

    await waitFor(() => expect(readRemainingSeconds()).toBeLessThan(before));
    expect(before - readRemainingSeconds()).toBeGreaterThanOrEqual(60);
    expect(before - readRemainingSeconds()).toBeLessThanOrEqual(62);
  });

  it('stops displaying an expired code rather than leaving it looking valid', async () => {
    issuePairingCodeMock.mockResolvedValue(issuedCode(30_000));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    await screen.findByTestId('pairing-code');

    await vi.advanceTimersByTimeAsync(31_000);

    await waitFor(() => expect(screen.queryByTestId('pairing-code')).not.toBeInTheDocument());
    expect(screen.queryByRole('img', { name: 'Pairing QR code' })).not.toBeInTheDocument();
    expect(screen.getByText(/That code has expired/)).toBeInTheDocument();
  });

  it('mints a fresh code rather than resurrecting the expired one', async () => {
    issuePairingCodeMock.mockResolvedValue(issuedCode(30_000));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    await screen.findByTestId('pairing-code');
    await vi.advanceTimersByTimeAsync(31_000);
    await screen.findByText(/That code has expired/);

    issuePairingCodeMock.mockResolvedValue({
      data: {
        code: 'AAAA-BBBB-CCCC',
        pairingUrl: 'https://bfm.example.com/devices/pair?code=AAAA-BBBB-CCCC',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Mint another' }));

    expect(await screen.findByTestId('pairing-code')).toHaveTextContent('AAAA-BBBB-CCCC');
    expect(issuePairingCodeMock).toHaveBeenCalledTimes(2);
  });

  it('treats an unparseable expiry as already expired rather than as forever', async () => {
    issuePairingCodeMock.mockResolvedValue({
      data: { code: '7QK4-9M2X-P3ND', pairingUrl: PAIRING_URL, expiresAt: 'not-a-date' },
    });
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));

    expect(await screen.findByText(/That code has expired/)).toBeInTheDocument();
    expect(screen.queryByTestId('pairing-code')).not.toBeInTheDocument();
  });

  it('surfaces an unavailable pillar without pretending a code was minted', async () => {
    issuePairingCodeMock.mockResolvedValue(errorResponse(503, 'bfm down'));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no code was minted/);
    expect(screen.queryByTestId('pairing-code')).not.toBeInTheDocument();
  });

  it('tells the operator to wait when the issuance budget is spent', async () => {
    issuePairingCodeMock.mockResolvedValue(errorResponse(429, 'slow down'));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many codes minted/);
  });

  it('separates a refusal from an outage', async () => {
    issuePairingCodeMock.mockResolvedValue(errorResponse(401, 'no principal'));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Cloudflare Access session/);
  });

  it('drops the code when the dialog is closed — it is not recoverable', async () => {
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    await screen.findByTestId('pairing-code');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    expect(issuePairingCodeMock).toHaveBeenCalledTimes(2);
  });
});

describe('DevicesPage — the code never leaves the screen', () => {
  it('writes nothing to localStorage or sessionStorage', async () => {
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    await screen.findByTestId('pairing-code');

    for (const store of [localStorage, sessionStorage]) {
      const written = Object.keys(store).map((key) => store.getItem(key) ?? '');
      expect(written.join('\n')).not.toContain('7QK4-9M2X-P3ND');
    }
  });

  it('puts nothing in the URL', async () => {
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    await screen.findByTestId('pairing-code');

    expect(window.location.href).not.toContain('7QK4');
  });

  it('logs nothing', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );

    const user = renderPage();
    await user.click(screen.getByRole('button', { name: 'Pair a new device' }));
    await screen.findByTestId('pairing-code');

    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('7QK4');
      }
      spy.mockRestore();
    }
  });
});

describe('DevicesPage — revoking a device', () => {
  beforeEach(() => {
    listDevicesMock.mockResolvedValue(devicesResponse(device()));
  });

  it('asks for confirmation, naming the device, before cutting it off', async () => {
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));

    expect(
      await screen.findByRole('heading', { name: "Revoke Joao's iPhone?" })
    ).toBeInTheDocument();
    expect(revokeDeviceMock).not.toHaveBeenCalled();
  });

  it('cancels without touching the pillar', async () => {
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(revokeDeviceMock).not.toHaveBeenCalled();
  });

  it('revokes by id on confirmation and refreshes the list', async () => {
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));
    listDevicesMock.mockResolvedValue(
      devicesResponse(device({ revokedAt: '2026-08-08T12:00:00.000Z' }))
    );
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(revokeDeviceMock).toHaveBeenCalledWith({ path: { id: 'dev-1' } });

    const row = await screen.findByRole('row', { name: /Joao's iPhone/ });
    await waitFor(() => expect(row).toHaveAttribute('data-revoked', 'true'));
  });

  /**
   * A dialog that closes on failure reads as "done" for an operation that did
   * not happen — and the handset is still trusted until it does.
   */
  it('keeps the dialog open and says so when revocation fails', async () => {
    revokeDeviceMock.mockResolvedValue(errorResponse(503, 'bfm down'));
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/still trusted/);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('distinguishes a refused revocation from an unreachable pillar', async () => {
    revokeDeviceMock.mockResolvedValue(errorResponse(404, 'gone'));
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/refused the request/);
  });

  /**
   * Cancel and the action are disabled mid-request, but Escape reaches Radix
   * directly. Letting it close would be worse than useless: the DELETE is
   * already on the wire and cannot be called back, so the dialog would vanish
   * looking cancelled while the revocation went ahead.
   */
  it('refuses to close on Escape while the revocation is in flight', async () => {
    let landRevoke!: (value: unknown) => void;
    revokeDeviceMock.mockReturnValue(
      new Promise((resolve) => {
        landRevoke = resolve;
      })
    );
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    await screen.findByRole('button', { name: 'Revoking…' });

    await user.keyboard('{Escape}');

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await act(async () => {
      landRevoke({
        data: { id: 'dev-1', revokedAt: '2026-08-08T12:00:00.000Z', alreadyRevoked: false },
      });
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  /**
   * The worse half of the same bug: a failure landing after an Escape-close
   * would render into a dialog that no longer exists, silently losing the one
   * message that says the handset is still trusted.
   */
  it('still surfaces a failure that lands after an attempted Escape', async () => {
    let landRevoke!: (value: unknown) => void;
    revokeDeviceMock.mockReturnValue(
      new Promise((resolve) => {
        landRevoke = resolve;
      })
    );
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    await screen.findByRole('button', { name: 'Revoking…' });

    await user.keyboard('{Escape}');

    await act(async () => {
      landRevoke(errorResponse(503, 'bfm down'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/still trusted/);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('still closes on Escape when no revocation is running', async () => {
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(revokeDeviceMock).not.toHaveBeenCalled();
  });

  it('retries after a failure without reopening the dialog', async () => {
    revokeDeviceMock.mockResolvedValueOnce(errorResponse(503, 'bfm down'));
    const user = renderPage();

    await user.click(await screen.findByRole('button', { name: "Revoke Joao's iPhone" }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(revokeDeviceMock).toHaveBeenCalledTimes(2);
  });
});
