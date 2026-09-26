import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ webSyncLedgerGet: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webSyncLedgerGet: (...args: unknown[]) => mocks.webSyncLedgerGet(...args),
}));

import { InventoryApiError } from '../inventory-api-helpers';
import { createTestQueryClient, withQueryClient } from './test-utils';
import {
  LEDGER_POLL_MS,
  SYNC_LEDGER_QUERY_KEY,
  useSyncAttention,
  useSyncLedger,
} from './useSyncLedger';

import type { WebSyncLedgerGetResponse } from '../inventory-api/types.gen.js';

type LedgerAttention = WebSyncLedgerGetResponse['attention'][number];
type LedgerDevice = WebSyncLedgerGetResponse['devices'][number];
type LedgerWaiting = WebSyncLedgerGetResponse['waiting'][number];

const LOADED_HEAD = '2026-09-27T00:00:00.000Z';
const NEW_HEAD = '2026-09-27T00:01:00.000Z';

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function device(id: string, receivedAt = LOADED_HEAD, attentionCount = 0): LedgerDevice {
  return {
    attentionCount,
    id,
    lastSyncAt: receivedAt,
    name: id === 'phone-1' ? "Joao's iPhone" : 'iPad',
    receivedAt,
    reportedAt: receivedAt,
  };
}

function attention(id: string, deviceId = 'phone-1'): LedgerAttention {
  return {
    deviceId,
    id,
    itemId: `item-${id}`,
    itemName: `Item ${id}`,
    kind: 'placement',
    openedAt: '2026-09-26T23:00:00.000Z',
    problem: `Problem ${id}`,
  };
}

function waiting(id: string, deviceId = 'phone-1'): LedgerWaiting {
  return {
    deviceId,
    id,
    itemName: `Item ${id}`,
    reason: { kind: 'app-update' },
    since: '2026-09-26T23:00:00.000Z',
    summary: `Waiting ${id}`,
  };
}

function ledger({
  receivedHead = LOADED_HEAD,
  devices = [device('phone-1')],
  attention: attentionEntries = [],
  waiting: waitingEntries = [],
  attentionCount = attentionEntries.length,
}: {
  receivedHead?: string | null;
  devices?: LedgerDevice[];
  attention?: LedgerAttention[];
  waiting?: LedgerWaiting[];
  attentionCount?: number;
} = {}): WebSyncLedgerGetResponse {
  return {
    attention: attentionEntries,
    attentionCount,
    devices,
    receivedHead,
    resolved: [],
    waiting: waitingEntries,
  };
}

function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  });
}

function renderLedger() {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...renderHook(() => useSyncLedger(), { wrapper: withQueryClient(queryClient) }),
  };
}

async function waitForSuccess(result: { current: ReturnType<typeof useSyncLedger> }) {
  await waitFor(() => expect(result.current.status).toBe('success'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useSyncLedger', () => {
  it('keeps attention in server order', async () => {
    const loaded = ledger({ attention: [attention('second'), attention('first')] });
    mocks.webSyncLedgerGet.mockResolvedValue(ok(loaded));
    const { result } = renderLedger();

    await waitForSuccess(result);

    expect(result.current.ledger).toBe(loaded);
    expect(result.current.ledger?.attention.map((entry) => entry.id)).toEqual(['second', 'first']);
  });

  it('reports an initial error without inventing a ledger', async () => {
    mocks.webSyncLedgerGet.mockResolvedValue({
      data: undefined,
      error: { message: 'ledger unavailable' },
      response: new Response(null, { status: 503 }),
    });
    const { result } = renderLedger();

    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.ledger).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(InventoryApiError);
    expect(result.current.error?.message).toBe('ledger unavailable');
    expect(result.current.stale).toBe(false);
  });

  it('keeps the loaded ledger when a newer report arrives', async () => {
    const loaded = ledger({ attention: [attention('existing')] });
    const polled = ledger({
      devices: [device('phone-1', NEW_HEAD)],
      attention: [attention('existing'), attention('new')],
      receivedHead: NEW_HEAD,
    });
    mocks.webSyncLedgerGet.mockResolvedValueOnce(ok(loaded)).mockResolvedValueOnce(ok(polled));
    const { result } = renderLedger();

    await waitForSuccess(result);
    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS));
    await waitFor(() => expect(result.current.stale).toBe(true));

    expect(result.current.ledger).toBe(loaded);
    expect(result.current.reportedSince).toEqual([{ device: polled.devices[0], changeCount: 1 }]);
  });

  it('counts new entries per device and floors an empty report at one', async () => {
    const loaded = ledger({
      attention: [attention('existing')],
      waiting: [waiting('waiting')],
    });
    const withTwoChanges = ledger({
      devices: [device('phone-1', NEW_HEAD)],
      attention: [attention('existing'), attention('new-1'), attention('new-2')],
      waiting: [waiting('waiting')],
      receivedHead: NEW_HEAD,
    });
    const withNoNewEntries = ledger({
      devices: [device('phone-1', '2026-09-27T00:02:00.000Z')],
      attention: [attention('existing')],
      waiting: [waiting('waiting')],
      receivedHead: '2026-09-27T00:02:00.000Z',
    });
    mocks.webSyncLedgerGet
      .mockResolvedValueOnce(ok(loaded))
      .mockResolvedValueOnce(ok(withTwoChanges))
      .mockResolvedValueOnce(ok(withNoNewEntries));
    const { result } = renderLedger();

    await waitForSuccess(result);
    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS));
    await waitFor(() => expect(result.current.reportedSince[0]?.changeCount).toBe(2));

    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS));
    await waitFor(() => expect(result.current.reportedSince[0]?.changeCount).toBe(1));
    expect(result.current.ledger).toBe(loaded);
  });

  it('does not mark equal or older reports as stale', async () => {
    const loaded = ledger({ devices: [device('phone-1')] });
    const polled = ledger({
      devices: [device('phone-1', LOADED_HEAD), device('phone-2', '2026-09-26T23:59:00.000Z')],
      receivedHead: LOADED_HEAD,
    });
    mocks.webSyncLedgerGet.mockResolvedValueOnce(ok(loaded)).mockResolvedValueOnce(ok(polled));
    const { result } = renderLedger();

    await waitForSuccess(result);
    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS));

    expect(result.current.reportedSince).toEqual([]);
    expect(result.current.stale).toBe(false);
  });

  it('treats every device as new when the loaded head is null', async () => {
    const loaded = ledger({
      receivedHead: null,
      devices: [device('phone-1'), device('phone-2')],
    });
    const polled = ledger({
      receivedHead: NEW_HEAD,
      devices: [device('phone-2', NEW_HEAD), device('phone-1', NEW_HEAD)],
    });
    mocks.webSyncLedgerGet.mockResolvedValueOnce(ok(loaded)).mockResolvedValueOnce(ok(polled));
    const { result } = renderLedger();

    await waitForSuccess(result);
    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS));
    await waitFor(() => expect(result.current.reportedSince).toHaveLength(2));

    expect(result.current.reportedSince.map(({ device }) => device.id)).toEqual([
      'phone-2',
      'phone-1',
    ]);
    expect(result.current.reportedSince.every(({ changeCount }) => changeCount === 1)).toBe(true);
  });

  it('does not poll while hidden and polls once on becoming visible', async () => {
    setVisibility('hidden');
    const loaded = ledger();
    const polled = ledger({ devices: [device('phone-1', NEW_HEAD)], receivedHead: NEW_HEAD });
    mocks.webSyncLedgerGet.mockResolvedValueOnce(ok(loaded)).mockResolvedValueOnce(ok(polled));
    const { result } = renderLedger();

    await waitForSuccess(result);
    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS * 2));
    expect(mocks.webSyncLedgerGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(mocks.webSyncLedgerGet).toHaveBeenCalledTimes(2));
    expect(result.current.ledger).toBe(loaded);
  });

  it('keeps reportedSince after a failed poll', async () => {
    const loaded = ledger();
    const polled = ledger({ devices: [device('phone-1', NEW_HEAD)], receivedHead: NEW_HEAD });
    mocks.webSyncLedgerGet
      .mockResolvedValueOnce(ok(loaded))
      .mockResolvedValueOnce(ok(polled))
      .mockRejectedValueOnce(new InventoryApiError('poll failed', 503));
    const { result } = renderLedger();

    await waitForSuccess(result);
    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS));
    await waitFor(() => expect(result.current.stale).toBe(true));
    const staleReport = result.current.reportedSince;

    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS));

    expect(result.current.reportedSince).toBe(staleReport);
    expect(result.current.ledger).toBe(loaded);
  });

  it('reload refetches the ledger and clears reportedSince', async () => {
    const loaded = ledger();
    const polled = ledger({ devices: [device('phone-1', NEW_HEAD)], receivedHead: NEW_HEAD });
    const reloaded = ledger({
      attention: [attention('resolved-after-reload')],
      receivedHead: '2026-09-27T00:03:00.000Z',
    });
    mocks.webSyncLedgerGet
      .mockResolvedValueOnce(ok(loaded))
      .mockResolvedValueOnce(ok(polled))
      .mockResolvedValueOnce(ok(reloaded));
    const { result } = renderLedger();

    await waitForSuccess(result);
    await act(async () => vi.advanceTimersByTimeAsync(LEDGER_POLL_MS));
    await waitFor(() => expect(result.current.stale).toBe(true));

    await act(async () => result.current.reload());

    expect(result.current.ledger).toEqual(reloaded);
    expect(result.current.reportedSince).toEqual([]);
    expect(result.current.stale).toBe(false);
    expect(mocks.webSyncLedgerGet).toHaveBeenCalledTimes(3);
  });
});

describe('useSyncAttention', () => {
  it('gives the total and per-device counts', async () => {
    const loaded = ledger({
      attentionCount: 5,
      devices: [device('phone-1', LOADED_HEAD, 5), device('phone-2', LOADED_HEAD, 0)],
    });
    mocks.webSyncLedgerGet.mockResolvedValue(ok(loaded));
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useSyncAttention(), {
      wrapper: withQueryClient(queryClient),
    });

    await waitFor(() => expect(result.current.attentionCount).toBe(5));

    expect(result.current.devices).toEqual([
      { id: 'phone-1', name: "Joao's iPhone", attentionCount: 5 },
      { id: 'phone-2', name: 'iPad', attentionCount: 0 },
    ]);
    expect(queryClient.getQueryCache().find({ queryKey: SYNC_LEDGER_QUERY_KEY })).toBeDefined();
    expect(mocks.webSyncLedgerGet).toHaveBeenCalledTimes(1);
  });

  it('returns a null count and no devices before an empty ledger loads', async () => {
    const loaded = ledger({ devices: [], attentionCount: 0 });
    mocks.webSyncLedgerGet.mockResolvedValue(ok(loaded));
    const { result } = renderHook(() => useSyncAttention(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    expect(result.current).toEqual({ attentionCount: null, devices: [] });
    await waitFor(() => expect(result.current.attentionCount).toBe(0));
    expect(result.current.devices).toEqual([]);
  });
});
