import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrap } from '../inventory-api-helpers.js';
import { webSyncLedgerGet } from '../inventory-api/index.js';

import type { InventoryApiError } from '../inventory-api-helpers.js';
import type { WebSyncLedgerGetResponse } from '../inventory-api/types.gen.js';

/** The cache key for the ledger displayed by the Sync page and Overview. */
export const SYNC_LEDGER_QUERY_KEY = ['inventory', 'sync-ledger'] as const;

/** The interval between background ledger polls while the document is visible. */
export const LEDGER_POLL_MS = 30_000;

/** A device report in the merged web sync ledger. */
export type LedgerDevice = WebSyncLedgerGetResponse['devices'][number];

/** A device report that arrived after the ledger currently shown on the page. */
export interface ReportedSince {
  device: LedgerDevice;
  /** New changes this device reported since the page loaded; always at least one. */
  changeCount: number;
}

/** The loaded ledger plus stale-report information for the Sync page. */
export interface SyncLedgerApi {
  /** The ledger as loaded; polling never replaces it. */
  ledger: WebSyncLedgerGetResponse | undefined;
  status: 'pending' | 'error' | 'success';
  error: InventoryApiError | null;
  /** Devices whose report arrived after the loaded ledger, in polled-device order. */
  reportedSince: ReportedSince[];
  /** Whether at least one device reported after the loaded ledger. */
  stale: boolean;
  /** Refetches the displayed ledger and clears stale-report information. */
  reload: () => Promise<void>;
}

/** The attention count and device counts needed by the Overview banner. */
export interface SyncAttention {
  attentionCount: number | null;
  devices: {
    id: string;
    name: string;
    attentionCount: number;
  }[];
}

const SYNC_LEDGER_POLL_QUERY_KEY = [...SYNC_LEDGER_QUERY_KEY, 'poll'] as const;

async function fetchSyncLedger(): Promise<WebSyncLedgerGetResponse> {
  return unwrap(await webSyncLedgerGet());
}

function entryIds(ledger: WebSyncLedgerGetResponse): ReadonlySet<string> {
  return new Set([
    ...ledger.attention.map((entry) => entry.id),
    ...ledger.waiting.map((entry) => entry.id),
  ]);
}

function isAfter(receivedAt: string, receivedHead: string | null): boolean {
  if (receivedHead === null) return true;
  const receivedTime = Date.parse(receivedAt);
  const headTime = Date.parse(receivedHead);
  return !Number.isNaN(receivedTime) && !Number.isNaN(headTime) && receivedTime > headTime;
}

function changeCount(
  ledger: WebSyncLedgerGetResponse,
  deviceId: string,
  loadedEntryIds: ReadonlySet<string>
): number {
  const newEntries = [
    ...ledger.attention.filter(
      (entry) => entry.deviceId === deviceId && !loadedEntryIds.has(entry.id)
    ),
    ...ledger.waiting.filter(
      (entry) => entry.deviceId === deviceId && !loadedEntryIds.has(entry.id)
    ),
  ].length;
  return Math.max(1, newEntries);
}

function reportsSince(
  loadedHead: string | null,
  loadedEntryIds: ReadonlySet<string>,
  polled: WebSyncLedgerGetResponse
): ReportedSince[] {
  return polled.devices.flatMap((device) => {
    if (!isAfter(device.receivedAt, loadedHead)) return [];
    return [{ device, changeCount: changeCount(polled, device.id, loadedEntryIds) }];
  });
}

function syncAttention(ledger: WebSyncLedgerGetResponse): SyncAttention {
  return {
    attentionCount: ledger.attentionCount,
    devices: ledger.devices.map(({ id, name, attentionCount }) => ({
      id,
      name,
      attentionCount,
    })),
  };
}

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

/** Reads and polls the Sync page's ledger without replacing the displayed snapshot. */
export function useSyncLedger(): SyncLedgerApi {
  const queryClient = useQueryClient();
  const query = useQuery<WebSyncLedgerGetResponse, InventoryApiError>({
    queryKey: SYNC_LEDGER_QUERY_KEY,
    queryFn: fetchSyncLedger,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
  const [reportedSince, setReportedSince] = useState<ReportedSince[]>([]);
  const loadedLedger = useRef<WebSyncLedgerGetResponse | undefined>(undefined);
  const loadedHead = useRef<string | null | undefined>(undefined);
  const loadedEntryIds = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (query.data === undefined || loadedLedger.current === query.data) return;
    loadedLedger.current = query.data;
    loadedHead.current = query.data.receivedHead;
    loadedEntryIds.current = entryIds(query.data);
  }, [query.data]);

  const poll = useCallback(async () => {
    if (!isVisible() || loadedHead.current === undefined) return;
    try {
      const polled = await queryClient.fetchQuery<WebSyncLedgerGetResponse, InventoryApiError>({
        queryKey: SYNC_LEDGER_POLL_QUERY_KEY,
        queryFn: fetchSyncLedger,
        staleTime: 0,
      });
      setReportedSince(reportsSince(loadedHead.current, loadedEntryIds.current, polled));
    } catch {
      return;
    }
  }, [queryClient]);

  useEffect(() => {
    if (query.data === undefined) return;
    const onVisibilityChange = () => {
      if (isVisible()) void poll();
    };
    const interval = window.setInterval(() => {
      if (isVisible()) void poll();
    }, LEDGER_POLL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [poll, query.data]);

  const refetch = query.refetch;
  const reload = useCallback(async () => {
    setReportedSince([]);
    await refetch();
  }, [refetch]);

  return {
    ledger: query.data,
    status: query.status,
    error: query.error ?? null,
    reportedSince,
    stale: reportedSince.length > 0,
    reload,
  };
}

/** Reads only the attention projection from the shared ledger query; it never starts polling. */
export function useSyncAttention(): SyncAttention {
  const query = useQuery<WebSyncLedgerGetResponse, InventoryApiError, SyncAttention>({
    queryKey: SYNC_LEDGER_QUERY_KEY,
    queryFn: fetchSyncLedger,
    select: syncAttention,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
  return query.data ?? { attentionCount: null, devices: [] };
}
