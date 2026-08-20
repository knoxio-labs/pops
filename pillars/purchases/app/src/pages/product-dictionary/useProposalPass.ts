import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unwrap } from '../../purchases-api-helpers.js';
import { productPropose } from '../../purchases-api/index.js';
import { PRODUCT_DICTIONARY_QUERY_KEY } from './useProductDictionary.js';

import type { ProposalOutcome } from './types.js';

export interface ProposalPassResult {
  run: () => void;
  isPending: boolean;
  /** The last run's own figures, or null before anything has been run here. */
  outcome: ProposalOutcome | null;
  error: string | null;
}

/**
 * `POST /products/proposals`, on demand and from a button.
 *
 * Nothing runs this pass on a schedule, so a deployment where nobody presses
 * this is a deployment whose dictionary stays empty and whose aggregates group
 * exactly as they did before it existed. The pass is idempotent and cannot
 * touch a wording a human asserted, which is what makes a button safe: the
 * worst a second press does is mint entries for wordings that gained one since
 * the first.
 *
 * The figures it answers with are reported rather than folded into a "done" —
 * `retired` is the count of entries a pass took back, and a reader who cannot
 * see it cannot tell a pass that changed nothing from one that removed a
 * proposal they were about to act on.
 */
export function useProposalPass(): ProposalPassResult {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => unwrap(await productPropose({ body: {} })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRODUCT_DICTIONARY_QUERY_KEY });
    },
  });

  return {
    run: () => mutation.mutate(),
    isPending: mutation.isPending,
    outcome: mutation.data ?? null,
    error: mutation.error instanceof Error ? mutation.error.message : null,
  };
}
