import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { unwrap } from '../../purchases-api-helpers.js';
import { reconcileConfirm, reconcileUnlink } from '../../purchases-api/index.js';
import { RECONCILE_QUEUE_QUERY_KEY } from './useReconcileQueue.js';

import type { DecisionKind, QueueEntry } from './types.js';

export interface DecisionOutcome {
  readonly kind: DecisionKind;
  readonly status: 'ok' | 'error';
  /** Populated only on `error`, carrying whatever the server explained. */
  readonly message: string | null;
}

export interface ReconcileDecisions {
  decide: (entry: QueueEntry, kind: DecisionKind) => void;
  isPending: boolean;
  lastOutcome: DecisionOutcome | null;
}

interface DecisionInput {
  readonly entry: QueueEntry;
  readonly kind: DecisionKind;
}

/**
 * Apply a decision to every proposal on one charge.
 *
 * The proposals on an entry are one answer, not competing ones: the solver
 * emits several links for a single charge when it was settled by a split
 * across transactions, so confirming one and leaving the rest would pin half a
 * partition. The endpoints take one link at a time, hence the loop.
 */
async function applyDecision({ entry, kind }: DecisionInput): Promise<DecisionKind> {
  const call = kind === 'accept' ? reconcileConfirm : reconcileUnlink;
  for (const link of entry.proposed) {
    unwrap(await call({ body: { chargeId: entry.chargeId, transactionUri: link.transactionUri } }));
  }
  return kind;
}

/**
 * The two decisions the shipped contract supports, and what they persist.
 *
 * `accept` sets `confirmedAt`, which pins the link against every future
 * re-derivation. It writes no `purchase_match_rule` — nothing does yet.
 *
 * `reject` calls `unlink`, which deletes the link and remembers nothing. The
 * next sweep is free to derive the same proposal again. There is no reject
 * endpoint to call instead: rejecting durably needs the rule table, and the
 * pillar declined to ship a button that silently undoes itself.
 */
export function useReconcileDecisions(onDecided: (entry: QueueEntry) => void): ReconcileDecisions {
  const queryClient = useQueryClient();
  const [lastOutcome, setLastOutcome] = useState<DecisionOutcome | null>(null);

  const mutation = useMutation({
    mutationFn: applyDecision,
    onSuccess: async (kind, variables) => {
      setLastOutcome({ kind, status: 'ok', message: null });
      onDecided(variables.entry);
      await queryClient.invalidateQueries({ queryKey: RECONCILE_QUEUE_QUERY_KEY });
    },
    onError: (error: unknown, variables) => {
      setLastOutcome({
        kind: variables.kind,
        status: 'error',
        message: error instanceof Error ? error.message : null,
      });
    },
  });

  return {
    decide: (entry, kind) => {
      // A charge with nothing proposed has no link to confirm or remove, so
      // both endpoints would 404. Refusing here keeps the queue's unexplained
      // rows from reporting a server error the user did not cause.
      if (entry.proposed.length === 0) return;
      mutation.mutate({ entry, kind });
    },
    isPending: mutation.isPending,
    lastOutcome,
  };
}
