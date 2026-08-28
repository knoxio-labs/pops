import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import { transactionsSuggestTags } from '../../../finance-api/index.js';
import { applyRecomputedTags, isPersistedEntityId } from './recompute-tags';

import type { Dispatch, SetStateAction } from 'react';

import type { SuggestedTag } from '@pops/finance';

import type { ProcessedTransaction } from '../../../store/importStore';
import type { LocalTxState } from './local-tx-reconcile';

/**
 * How many suggest-tags lookups run at once. A group can hold dozens of rows,
 * and while the endpoint is read-only and cheap, firing every distinct
 * description at the pillar simultaneously turns one click into a burst the
 * import server has to serve alongside the reevaluation it is already running.
 */
const MAX_CONCURRENT_LOOKUPS = 6;

/**
 * Rule/entity suggestions never change under a running import — no rule is
 * persisted mid-Review except through a proposal, which invalidates on its own
 * — so a repeat lookup for the same pair inside one session is pure waste.
 */
const SUGGEST_TAGS_STALE_TIME = 60_000;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = Array.from({ length: items.length });
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (let index = cursor++; index < items.length; index = cursor++) {
      const item = items[index];
      if (item === undefined) continue;
      try {
        results[index] = { status: 'fulfilled', value: await run(item) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * `description → checksums`. One lookup per distinct description, not per row:
 * "Accept all" over a group of near-identical descriptors collapses to a
 * handful of calls.
 */
function groupByDescription(transactions: readonly ProcessedTransaction[]): Map<string, string[]> {
  const byDescription = new Map<string, string[]>();
  for (const t of transactions) {
    const checksums = byDescription.get(t.description);
    if (checksums) checksums.push(t.checksum);
    else byDescription.set(t.description, [t.checksum]);
  }
  return byDescription;
}

/**
 * Fan each description's result back out to its rows, counting the lookups
 * that failed so the caller can say so. A failed description contributes
 * nothing, leaving those rows on the suggestions they already had.
 */
function collectFresh(
  descriptions: readonly string[],
  byDescription: ReadonlyMap<string, string[]>,
  settled: readonly PromiseSettledResult<SuggestedTag[]>[]
): { fresh: Map<string, SuggestedTag[]>; failures: number } {
  const fresh = new Map<string, SuggestedTag[]>();
  let failures = 0;
  for (const [index, outcome] of settled.entries()) {
    const description = descriptions[index];
    if (description === undefined) continue;
    if (outcome.status === 'rejected') {
      failures += 1;
      continue;
    }
    for (const checksum of byDescription.get(description) ?? []) fresh.set(checksum, outcome.value);
  }
  return { fresh, failures };
}

interface UseSuggestedTagRecomputeArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
}

/**
 * Re-derive `suggestedTags` for rows whose entity the user just assigned by
 * hand (POPS-2595).
 *
 * The pipeline computes a row's tag suggestions once, against the entity it had
 * resolved at process time. A manual assignment rewrites the entity and leaves
 * the suggestions alone, so a row the user resolved themselves reaches Tag
 * Review missing exactly the two passes that need an entity — the contact's
 * default tags, and every tag rule scoped to that contact. This hook closes
 * that gap by re-running the read-only `GET /transactions/suggest-tags` lookup
 * for the new entity and merging the answer back into the row.
 *
 * The lookup deliberately reuses the read-only endpoint rather than a new
 * server-side recompute: the client's Review state has no server-side
 * representation, and inventing one would be a far larger change than the
 * defect warrants. The endpoint passes `recordTagRuleUsage: false`, so a
 * recompute never counts as a rule application.
 *
 * `isRecomputingTags` is true while any lookup is outstanding. The Review step
 * gates "Continue to Tag Review" on it, so the confirmed set is never built
 * from a row whose suggestions are still mid-flight.
 */
export function useSuggestedTagRecompute({ setLocalTransactions }: UseSuggestedTagRecomputeArgs) {
  const queryClient = useQueryClient();
  const [inFlight, setInFlight] = useState(0);

  const fetchForDescription = useCallback(
    async (description: string, entityId: string): Promise<SuggestedTag[]> => {
      const { tags } = await queryClient.fetchQuery({
        queryKey: ['finance', 'transactions', 'suggestTags', entityId, description],
        queryFn: async () =>
          unwrap(await transactionsSuggestTags({ query: { description, entityId } })),
        staleTime: SUGGEST_TAGS_STALE_TIME,
      });
      return tags;
    },
    [queryClient]
  );

  const recomputeForEntity = useCallback(
    async (transactions: readonly ProcessedTransaction[], entityId: string): Promise<void> => {
      if (transactions.length === 0) return;

      // A locally-pending entity has no defaults and no rules scoped to it, so
      // there is nothing to look up — but the row may still carry the previous
      // entity's defaults, which an empty `fresh` set strips.
      if (!isPersistedEntityId(entityId)) {
        const cleared = new Map(transactions.map((t) => [t.checksum, [] as SuggestedTag[]]));
        setLocalTransactions((prev) => applyRecomputedTags(prev, cleared));
        return;
      }

      const byDescription = groupByDescription(transactions);
      const descriptions = [...byDescription.keys()];

      setInFlight((n) => n + 1);
      try {
        const settled = await mapWithConcurrency(
          descriptions,
          MAX_CONCURRENT_LOOKUPS,
          async (description) => fetchForDescription(description, entityId)
        );
        const { fresh, failures } = collectFresh(descriptions, byDescription, settled);
        if (fresh.size > 0) setLocalTransactions((prev) => applyRecomputedTags(prev, fresh));
        // Saying nothing would leave the user looking at the very tag set this
        // recompute exists to replace, with no way to tell it is stale.
        if (failures > 0) {
          toast.error(
            `Could not refresh tag suggestions for ${failures} description(s) — check them in Tag Review.`
          );
        }
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [fetchForDescription, setLocalTransactions]
  );

  return { recomputeForEntity, isRecomputingTags: inFlight > 0 };
}

export type RecomputeForEntity = ReturnType<typeof useSuggestedTagRecompute>['recomputeForEntity'];
