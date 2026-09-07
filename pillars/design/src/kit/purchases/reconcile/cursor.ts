import { useCallback, useMemo, useState } from 'react';

import type { QueueEntry } from '@/fixtures/purchases-queue';

export interface QueueCursor {
  activeChargeId: string | null;
  activeEntry: QueueEntry | undefined;
  moveBy: (delta: number) => void;
  select: (entry: QueueEntry) => void;
  /** Park the cursor on whatever follows this entry, before the list changes. */
  skipPast: (entry: QueueEntry) => void;
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

/** The index of `chargeId` in `entries`, or 0 if it is not there. */
export function activeIndexFor(entries: readonly QueueEntry[], chargeId: string | null): number {
  if (entries.length === 0) return -1;
  const found = entries.findIndex((entry) => entry.chargeId === chargeId);
  return found === -1 ? 0 : found;
}

/** The charge id `entries[index + delta]` names, clamped to the list's bounds. */
export function chargeIdAfterMove(
  entries: readonly QueueEntry[],
  index: number,
  delta: number
): string | undefined {
  return entries[clampIndex(index + delta, entries.length)]?.chargeId;
}

/**
 * The charge id to land on once `chargeId` leaves the list: its successor,
 * or `chargeId` itself if it had none, so a list that drops the entry falls
 * back to the top rather than to a stale neighbour.
 */
export function chargeIdAfterSkip(entries: readonly QueueEntry[], chargeId: string): string {
  const index = entries.findIndex((entry) => entry.chargeId === chargeId);
  const successor = index === -1 ? undefined : entries[index + 1];
  return successor?.chargeId ?? chargeId;
}

/**
 * Where the keyboard is pointing, keyed by charge rather than by index —
 * see `pillars/purchases/app/src/pages/reconcile/useQueueCursor.ts` for why
 * an index-based cursor cannot survive both an accept and a reject.
 */
export function useQueueCursor(
  entries: readonly QueueEntry[],
  initialChargeId: string | null = null
): QueueCursor {
  const [requestedChargeId, setRequestedChargeId] = useState<string | null>(initialChargeId);

  const activeIndex = useMemo(
    () => activeIndexFor(entries, requestedChargeId),
    [entries, requestedChargeId]
  );
  const activeEntry = activeIndex === -1 ? undefined : entries[activeIndex];

  const moveBy = useCallback(
    (delta: number) => {
      const next = chargeIdAfterMove(entries, activeIndex, delta);
      if (next !== undefined) setRequestedChargeId(next);
    },
    [activeIndex, entries]
  );

  const select = useCallback((entry: QueueEntry) => {
    setRequestedChargeId(entry.chargeId);
  }, []);

  const skipPast = useCallback(
    (entry: QueueEntry) => {
      setRequestedChargeId(chargeIdAfterSkip(entries, entry.chargeId));
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
