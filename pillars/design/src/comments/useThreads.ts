/**
 * The overlay's data: the threads on one route, refreshed on demand.
 *
 * `available` is the load-bearing state. The API is absent in a plain local
 * checkout (no service token, so the dev proxy is not mounted), and the
 * overlay's answer to that is to disappear rather than to render a broken
 * affordance, so a failed identity call is a normal outcome here, not an
 * error to surface.
 *
 * `unavailableReason` says which failure it was, because one of them is not a
 * missing API at all. Reached over the LAN or tailscale, the deployed API is
 * up but the request carries no Access assertion, so it answers 403. Hiding
 * on that looks identical to the local-checkout case and names nothing; the
 * overlay says so instead.
 */
import { useCallback, useEffect, useState } from 'react';

import { fetchIdentity, fetchThreads, type Thread } from './api';

/** Why the comment API cannot be used, when it cannot. */
export type UnavailableReason = 'refused' | 'unreachable';

export interface ThreadsState {
  threads: Thread[];
  /** Whether the comment API vouched for this caller. `null` while unknown. */
  available: boolean | null;
  /** Why `available` is false; `null` while unknown or when available. */
  unavailableReason: UnavailableReason | null;
  refresh: () => void;
}

export function useThreads(route: string): ThreadsState {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<UnavailableReason | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const identity = await fetchIdentity();
      if (cancelled) return;
      if (identity.kind !== 'ok') {
        setAvailable(false);
        setUnavailableReason(identity.kind);
        setThreads([]);
        return;
      }
      setAvailable(true);
      setUnavailableReason(null);
      const found = await fetchThreads(route);
      if (!cancelled) setThreads(found ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [route, nonce]);

  return {
    threads,
    available,
    unavailableReason,
    refresh: useCallback(() => setNonce((n) => n + 1), []),
  };
}
