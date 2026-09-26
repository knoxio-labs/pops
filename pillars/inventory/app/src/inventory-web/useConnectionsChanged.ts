import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrap } from '../inventory-api-helpers.js';
import { webChangesHead } from '../inventory-api/index.js';
import { CHANGES_POLL_MS } from './useChangedElsewhere.js';

import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { WebChangesHeadResponse } from '../inventory-api/types.gen.js';

/** The cache key used for every connections-change head read. */
export const CONNECTIONS_CHANGED_QUERY_KEY = ['inventory', 'connections-changed'] as const;

/** The stale state and explicit reload operation for connection-backed pages. */
export interface ConnectionsChanged {
  /** The newer server change time, or null when the baseline is current. */
  readonly changedAt: string | null;
  readonly stale: boolean;
  /** Refetches the supplied page queries and establishes a new head baseline. */
  readonly reload: () => Promise<void>;
}

type Baseline = { readonly changedAt: string | null; readonly writeVersion: number };
type ReadHead = () => Promise<string | null>;

let localWriteVersion = 0;

/** Records a successful local connection or fixture write for every mounted watcher. */
export function markConnectionsWrittenHere(): void {
  localWriteVersion += 1;
}

function readConnectionsChangedAt(head: WebChangesHeadResponse): string | null {
  return head.connectionsChangedAt;
}

function useHeadReader(queryClient: QueryClient): ReadHead {
  return useCallback(
    () =>
      queryClient.fetchQuery<string | null>({
        queryKey: CONNECTIONS_CHANGED_QUERY_KEY,
        queryFn: async () => readConnectionsChangedAt(unwrap(await webChangesHead({ query: {} }))),
        staleTime: 0,
      }),
    [queryClient]
  );
}

function isLater(changedAt: string | null, baseline: string | null): boolean {
  return changedAt !== null && (baseline === null || changedAt > baseline);
}

async function readAndApply(
  readHead: ReadHead,
  baseline: { current: Baseline | null },
  setChangedAt: (changedAt: string | null) => void,
  isCurrent: () => boolean
): Promise<void> {
  try {
    const changedAt = await readHead();
    if (!isCurrent()) return;
    const writeVersion = localWriteVersion;
    const previous = baseline.current;
    if (previous === null || previous.writeVersion !== writeVersion) {
      baseline.current = { changedAt, writeVersion };
      return;
    }
    if (isLater(changedAt, previous.changedAt)) setChangedAt(changedAt);
  } catch {
    return;
  }
}

function useConnectionPolling(
  enabled: boolean,
  readHead: ReadHead
): { readonly changedAt: string | null; readonly reset: () => Promise<void> } {
  const baseline = useRef<Baseline | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const [changedAt, setChangedAt] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const effectGeneration = generation.current + 1;
    generation.current = effectGeneration;
    baseline.current = null;
    let active = true;

    const isCurrent = (readGeneration: number): boolean =>
      active && mounted.current && generation.current === readGeneration;
    const read = (): void => {
      const readGeneration = generation.current;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void readAndApply(readHead, baseline, setChangedAt, () => isCurrent(readGeneration));
    };

    void Promise.resolve().then(() => {
      if (isCurrent(effectGeneration)) setChangedAt(null);
    });
    if (!enabled) {
      return () => {
        active = false;
      };
    }

    read();
    const timer = window.setInterval(read, CHANGES_POLL_MS);
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, readHead]);

  const reset = useCallback(async (): Promise<void> => {
    const resetGeneration = generation.current + 1;
    generation.current = resetGeneration;
    baseline.current = null;
    const currentChangedAt = await readHead();
    if (!mounted.current || generation.current !== resetGeneration) return;
    baseline.current = { changedAt: currentChangedAt, writeVersion: localWriteVersion };
    setChangedAt(null);
  }, [readHead]);

  return { changedAt, reset };
}

/** Polls connection change time while visible without replacing page data automatically. */
export function useConnectionsChanged(options: {
  readonly queryKeys: readonly QueryKey[];
  readonly enabled?: boolean;
}): ConnectionsChanged {
  const queryClient = useQueryClient();
  const readHead = useHeadReader(queryClient);
  const { changedAt, reset } = useConnectionPolling(options.enabled ?? true, readHead);

  const reload = useCallback(async (): Promise<void> => {
    for (const queryKey of options.queryKeys) {
      await queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
    }
    await reset();
  }, [options.queryKeys, queryClient, reset]);

  return { changedAt, stale: changedAt !== null, reload };
}
