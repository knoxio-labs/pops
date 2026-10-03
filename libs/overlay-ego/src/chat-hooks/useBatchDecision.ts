import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { egoDecideActionBatch } from '../ego-api';
import { unwrap } from '../ego-api-helpers';

/** The action ids to approve or reject, and tools to allow for this conversation. */
export interface BatchDecision {
  approve: string[];
  reject: string[];
  alwaysAllow: string[];
}

/**
 * Decision controls for one action batch. Continuation fields are supplied by the chat model
 * (WEB-26); this hook only records a decision and never sets them.
 */
export interface BatchDecisionApi {
  decide: (batchId: string, decision: BatchDecision) => Promise<void>;
  decidingBatchId: string | null;
  error: string | null;
  continuableBatchId?: string | null;
  continueBatch?: (batchId: string) => void;
}

interface BatchDecisionRequest {
  batchId: string;
  decision: BatchDecision;
}

/**
 * Records one decision at a time. The server changes pending actions to confirmed or rejected;
 * this hook does not run approved actions. A successful decision only records intent, and the
 * follow-up stream is responsible for running approved actions.
 */
export function useBatchDecision(
  conversationId: string | null,
  onDecided: (batchId: string) => void
): BatchDecisionApi {
  const queryClient = useQueryClient();
  const requestInFlight = useRef(false);
  const [decidingBatchId, setDecidingBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync } = useMutation({
    mutationFn: async ({ batchId, decision }: BatchDecisionRequest) =>
      unwrap(await egoDecideActionBatch({ path: { batchId }, body: decision })),
  });

  const decide = useCallback(
    async (batchId: string, decision: BatchDecision) => {
      if (conversationId === null || requestInFlight.current) return;

      // React state updates are deferred, so the ref prevents duplicate same-tick submissions.
      requestInFlight.current = true;
      setDecidingBatchId(batchId);
      setError(null);

      try {
        await mutateAsync({ batchId, decision });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['ego', 'conversations', 'get', { id: conversationId }],
          }),
          queryClient.invalidateQueries({ queryKey: ['ego', 'conversations', 'list'] }),
        ]);
        onDecided(batchId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'ego API request failed');
      } finally {
        requestInFlight.current = false;
        setDecidingBatchId(null);
      }
    },
    [conversationId, mutateAsync, onDecided, queryClient]
  );

  return { decide, decidingBatchId, error };
}
