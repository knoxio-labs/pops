import { useCallback, useMemo, useState } from 'react';

import type { QueueEntry } from './types.js';

export interface QueueCursor {
  activeChargeId: string | null;
  activeEntry: QueueEntry | undefined;
  moveBy: (delta: number) => void;
  select: (entry: QueueEntry) => void;
  /** Park the cursor on whatever follows this entry, before the list reloads. */
  skipPast: (entry: QueueEntry) => void;
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * Where the keyboard is pointing, keyed by charge rather than by index.
 *
 * Every decision changes the list underneath the cursor: confirming drops the
 * entry, and rejecting leaves it in place as an unexplained charge because
 * `unlink` removes the link without remembering the rejection. An index-based
 * cursor advances correctly for exactly one of those and silently skips or
 * sticks on the other. Naming the charge makes both cases the same operation —
 * park on the successor, then let the refetch land wherever it lands.
 */
export function useQueueCursor(entries: readonly QueueEntry[]): QueueCursor {
  const [requestedChargeId, setRequestedChargeId] = useState<string | null>(null);

  const activeIndex = useMemo(() => {
    if (entries.length === 0) return -1;
    const found = entries.findIndex((entry) => entry.chargeId === requestedChargeId);
    // The requested charge is gone — a sweep re-derived it, or it was just
    // confirmed. Falling back to the top is what an inbox does.
    return found === -1 ? 0 : found;
  }, [entries, requestedChargeId]);

  const activeEntry = activeIndex === -1 ? undefined : entries[activeIndex];

  const moveBy = useCallback(
    (delta: number) => {
      if (entries.length === 0) return;
      const next = entries[clamp(activeIndex + delta, entries.length)];
      if (next !== undefined) setRequestedChargeId(next.chargeId);
    },
    [activeIndex, entries]
  );

  const select = useCallback((entry: QueueEntry) => {
    setRequestedChargeId(entry.chargeId);
  }, []);

  const skipPast = useCallback(
    (entry: QueueEntry) => {
      const index = entries.findIndex((candidate) => candidate.chargeId === entry.chargeId);
      // No successor: hold the current charge so a refetch that drops it falls
      // back to the top rather than to a stale neighbour.
      const successor = index === -1 ? undefined : entries[index + 1];
      setRequestedChargeId(successor?.chargeId ?? entry.chargeId);
    },
    [entries]
  );

  return {
    activeChargeId: activeEntry?.chargeId ?? null,
    activeEntry,
    moveBy,
    select,
    skipPast,
  };
}
