import { useCallback, useState } from 'react';

import type { QueueEntry } from '@/fixtures/purchases-queue';

import type { DecisionKind } from './types';

export interface DecisionOutcome {
  readonly kind: DecisionKind;
}

export interface QueueDecisions {
  decide: (entry: QueueEntry, kind: DecisionKind) => void;
  lastOutcome: DecisionOutcome | null;
}

/**
 * What `accept` and `reject` leave behind, mirroring what the shipped page's
 * two endpoints actually persist (see `useReconcileDecisions.ts` in the
 * app): accepting pins the link and drops the row, rejecting only deletes
 * the link, which the queue then shows as unexplained rather than removing.
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
      setLastOutcome({ kind });
      onDecided(entry);
    },
    [entries, setEntries, onDecided]
  );

  return { decide, lastOutcome };
}
