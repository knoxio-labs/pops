/**
 * The overlay's data: the threads on one route, refreshed on demand.
 *
 * `available` is the load-bearing state. The API is absent in a plain local
 * checkout (no service token, so the dev proxy is not mounted), and the
 * overlay's answer to that is to disappear rather than to render a broken
 * affordance — so a failed identity call is a normal outcome here, not an
 * error to surface.
 */
import { useCallback, useEffect, useState } from 'react';

import { fetchIdentity, fetchThreads, type Thread } from './api';

export interface ThreadsState {
  threads: Thread[];
  /** Whether the comment API answered at all. `null` while unknown. */
  available: boolean | null;
  refresh: () => void;
}

export function useThreads(route: string): ThreadsState {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const identity = await fetchIdentity();
      if (cancelled) return;
      if (!identity) {
        setAvailable(false);
        setThreads([]);
        return;
      }
      setAvailable(true);
      const found = await fetchThreads(route);
      if (!cancelled) setThreads(found ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [route, nonce]);

  return { threads, available, refresh: useCallback(() => setNonce((n) => n + 1), []) };
}
