import { useCallback, useState } from 'react';

import type { QueueEntry } from '@/fixtures/purchases-queue';

import type { DecisionKind } from './types';

export type DecisionOutcome =
  | { readonly status: 'ok'; readonly kind: DecisionKind }
  /** The server's own explanation, shown as sent. */
  | { readonly status: 'failed'; readonly kind: DecisionKind; readonly message: string };

export interface QueueDecisions {
  decide: (entry: QueueEntry, kind: DecisionKind) => void;
  lastOutcome: DecisionOutcome | null;
}

/**
 * What `accept` and `reject` leave behind, which is narrower than the words
 * suggest: accepting pins the link and drops the row, while rejecting only
 * deletes the link, so the charge returns to the queue as unexplained rather
 * than leaving it.
 */
export function applyQueueDecision(
  entries: readonly QueueEntry[],
  chargeId: string,
  kind: DecisionKind
): QueueEntry[] {
  return entries.flatMap((entry) => {
    if (entry.chargeId !== chargeId) return [entry];
    if (kind === 'accept') return [];
    return [{ ...entry, proposed: [], deltaCents: -entry.amountCents }];
  });
}

/**
 * The design surface's stand-in for `useReconcileDecisions`: nothing here
 * calls a server, so a decision applies immediately rather than sitting
 * behind `isPending` and a mutation.
 */
export function useQueueDecisions(
  entries: QueueEntry[],
  setEntries: (next: QueueEntry[]) => void,
  onDecided: (entry: QueueEntry) => void
): QueueDecisions {
  const [lastOutcome, setLastOutcome] = useState<DecisionOutcome | null>(null);

  const decide = useCallback(
    (entry: QueueEntry, kind: DecisionKind) => {
      // A charge with nothing proposed has no link to confirm or remove.
      if (entry.proposed.length === 0) return;
      setEntries(applyQueueDecision(entries, entry.chargeId, kind));
      setLastOutcome({ status: 'ok', kind });
      onDecided(entry);
    },
    [entries, setEntries, onDecided]
  );

  return { decide, lastOutcome };
}
