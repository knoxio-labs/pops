import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { MAX_MUTATION_BATCH } from '@pops/inventory';

import { dedupeIds } from './item-verbs-bulk-preparation.js';
import { sendInventoryMutations, type InventoryCommandInput } from './mutation-client.js';

const WEB_QUERY_ROOT = ['inventory', 'web'] as const;

/** The ids removed by an undo and the ids that remain because deletion failed. */
export interface DeleteCreatedResult {
  removed: string[];
  kept: string[];
}

function deleteInputs(ids: readonly string[]): InventoryCommandInput[] {
  return ids.map((id) => ({
    command: { op: 'item.delete', args: {} },
    entityId: id,
    baseRevision: 1,
  }));
}

async function deleteBatch(ids: readonly string[], result: DeleteCreatedResult): Promise<void> {
  try {
    const outcomes = await sendInventoryMutations(deleteInputs(ids));
    if (outcomes.length !== ids.length) {
      throw new Error(`inventory delete returned ${String(outcomes.length)} outcomes`);
    }
    outcomes.forEach((outcome, index) => {
      const id = ids[index];
      if (id === undefined) throw new Error('inventory delete returned an invalid id index');
      (outcome.status === 'applied' ? result.removed : result.kept).push(id);
    });
  } catch {
    result.kept.push(...ids);
  }
}

async function deleteCreated(ids: readonly string[], queryClient: QueryClient) {
  const uniqueIds = dedupeIds(ids);
  const result: DeleteCreatedResult = { removed: [], kept: [] };

  for (let start = 0; start < uniqueIds.length; start += MAX_MUTATION_BATCH) {
    await deleteBatch(uniqueIds.slice(start, start + MAX_MUTATION_BATCH), result);
  }

  if (result.removed.length > 0) {
    await queryClient.invalidateQueries({ queryKey: WEB_QUERY_ROOT });
  }
  return result;
}

/** Deletes items this page just created with the creation revision as its base. */
export function useDeleteCreated(): (ids: readonly string[]) => Promise<DeleteCreatedResult> {
  const queryClient = useQueryClient();
  return useCallback((ids) => deleteCreated(ids, queryClient), [queryClient]);
}
