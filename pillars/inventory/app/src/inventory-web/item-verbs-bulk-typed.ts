import { executeBulk, type PreparedBulkItem } from './item-verbs-bulk-execution.js';
import {
  dedupeIds,
  dedupeWrites,
  emptyBulkResult,
  identityPatch,
  loadedItems,
  requireCatalogueRevision,
} from './item-verbs-bulk-preparation.js';

import type { BulkActionContext } from './item-verbs-bulk-preparation.js';
import type { BulkItemVerbs, BulkResult } from './item-verbs-bulk-types.js';

async function changeType(
  context: BulkActionContext,
  ids: readonly string[],
  typeKey: string,
  values: Parameters<BulkItemVerbs['changeType']>[2]
): Promise<BulkResult> {
  const uniqueIds = dedupeIds(ids);
  if (uniqueIds.length === 0) return emptyBulkResult();
  const catalogueRevision = requireCatalogueRevision(context.catalogue);
  const type = context.catalogue.types.find((candidate) => candidate.key === typeKey);
  if (type === undefined) throw new Error(`unknown type ${typeKey}`);
  loadedItems(context.optimistic, uniqueIds);
  const prepared = uniqueIds.map((id): PreparedBulkItem => ({
    id,
    patch: identityPatch,
    command: { op: 'item.changeType', args: { typeId: type.id, values: values ?? [] } },
    catalogueRevision,
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

async function editValues(
  context: BulkActionContext,
  writes: Parameters<BulkItemVerbs['editValues']>[0]
): Promise<BulkResult> {
  const effectiveWrites = dedupeWrites(writes).filter((write) => write.patches.length > 0);
  if (effectiveWrites.length === 0) return emptyBulkResult();
  const catalogueRevision = requireCatalogueRevision(context.catalogue);
  const ids = effectiveWrites.map(({ id }) => id);
  loadedItems(context.optimistic, ids);
  const prepared = effectiveWrites.map((write): PreparedBulkItem => ({
    id: write.id,
    patch: identityPatch,
    command: { op: 'item.edit', args: { values: write.patches } },
    catalogueRevision,
  }));
  const execution = await executeBulk({
    queryClient: context.queryClient,
    optimistic: context.optimistic,
    ids,
    prepared,
    initialRefusals: [],
  });
  return execution.result;
}

/** Builds the stable-ID typed bulk verbs. */
export function createBulkTypedVerbs(
  context: BulkActionContext
): Pick<BulkItemVerbs, 'changeType' | 'editValues'> {
  return {
    changeType: (ids, typeKey, values) => changeType(context, ids, typeKey, values),
    editValues: (writes) => editValues(context, writes),
  };
}
