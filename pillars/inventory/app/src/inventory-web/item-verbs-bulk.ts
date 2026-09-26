import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { executeBulk, type PreparedBulkItem } from './item-verbs-bulk-execution.js';
import { createBulkPlacementVerbs } from './item-verbs-bulk-placement.js';
import {
  createBulkActionContext,
  dedupeIds,
  emptyBulkResult,
  loadedItems,
} from './item-verbs-bulk-preparation.js';
import { createBulkTypedVerbs } from './item-verbs-bulk-typed.js';
import { VERB_PATCHES } from './item-verbs.js';
import { useCatalogue, type CatalogueType } from './useCatalogueLookups.js';

import type { BulkActionContext } from './item-verbs-bulk-preparation.js';
import type { BulkCatalogue, BulkItemVerbs, BulkResult } from './item-verbs-bulk-types.js';

export {
  BulkUndoRefusedError,
  type BulkItemRefusal,
  type BulkItemVerbs,
  type BulkRefusal,
  type BulkResult,
  type BulkCatalogue,
  type ItemValueWrite,
} from './item-verbs-bulk-types.js';

const EMPTY_TYPES: readonly CatalogueType[] = [];

function usePublishedCatalogue(): BulkCatalogue {
  const query = useCatalogue();
  return {
    types: query.data?.types ?? EMPTY_TYPES,
    revision: query.data?.revision.revision ?? null,
  };
}

async function setAccess(
  context: BulkActionContext,
  ids: readonly string[],
  access: 'open' | 'closed'
): Promise<BulkResult> {
  const uniqueIds = dedupeIds(ids);
  if (uniqueIds.length === 0) return emptyBulkResult();
  loadedItems(context.optimistic, uniqueIds);
  const prepared = uniqueIds.map((id): PreparedBulkItem => ({
    id,
    patch: VERB_PATCHES.access(access),
    command: { op: 'item.setAccess', args: { access } },
  }));
  const execution = await executeBulk({
    queryClient: context.queryClient,
    optimistic: context.optimistic,
    ids: uniqueIds,
    prepared,
    initialRefusals: [],
  });
  return execution.result;
}

async function setLifecycle(
  context: BulkActionContext,
  ids: readonly string[],
  lifecycle: 'retired' | 'discarded',
  reason: string | null
): Promise<BulkResult> {
  const uniqueIds = dedupeIds(ids);
  if (uniqueIds.length === 0) return emptyBulkResult();
  loadedItems(context.optimistic, uniqueIds);
  const args = reason === null ? { lifecycle } : { lifecycle, reason };
  const prepared = uniqueIds.map((id): PreparedBulkItem => ({
    id,
    patch: VERB_PATCHES.lifecycle(lifecycle),
    command: { op: 'item.setLifecycle', args },
  }));
  const execution = await executeBulk({
    queryClient: context.queryClient,
    optimistic: context.optimistic,
    ids: uniqueIds,
    prepared,
    initialRefusals: [],
  });
  return execution.result;
}

function createBulkStateVerbs(
  context: BulkActionContext
): Pick<BulkItemVerbs, 'setAccess' | 'setLifecycle'> {
  return {
    setAccess: (ids, access) => setAccess(context, ids, access),
    setLifecycle: (ids, lifecycle, reason) => setLifecycle(context, ids, lifecycle, reason),
  };
}

function createBulkItemVerbs(queryClient: QueryClient, catalogue: BulkCatalogue): BulkItemVerbs {
  const context = createBulkActionContext(queryClient, catalogue);
  return {
    ...createBulkPlacementVerbs(context),
    ...createBulkStateVerbs(context),
    ...createBulkTypedVerbs(context),
  };
}

/** Returns typed bulk item verbs backed by the current React Query client. */
export function useBulkItemVerbs(): BulkItemVerbs {
  const queryClient = useQueryClient();
  const catalogue = usePublishedCatalogue();
  return useMemo(() => createBulkItemVerbs(queryClient, catalogue), [catalogue, queryClient]);
}
