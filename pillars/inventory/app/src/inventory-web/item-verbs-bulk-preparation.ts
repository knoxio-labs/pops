import { type InventoryCommand, type InventoryPlacementTarget } from './commands.js';
import { VERB_PATCHES, wirePlacement } from './item-verbs.js';
import { optimisticItemsFor, type OptimisticItems } from './optimistic-items.js';

import type { QueryClient } from '@tanstack/react-query';

import type { FixedPlacement } from '../foundation/model/model.js';
import type { WebItem } from './item-row-model.js';
import type { BulkCatalogue, BulkResult, ItemValueWrite } from './item-verbs-bulk-types.js';

/** Context shared by the bulk action builders. */
export interface BulkActionContext {
  readonly queryClient: QueryClient;
  readonly optimistic: OptimisticItems;
  readonly catalogue: BulkCatalogue;
}

/** Creates the optimistic and query context used by action builders. */
export function createBulkActionContext(
  queryClient: QueryClient,
  catalogue: BulkCatalogue
): BulkActionContext {
  return { queryClient, optimistic: optimisticItemsFor(queryClient), catalogue };
}

/** Keeps the first occurrence of each item id. */
export function dedupeIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Keeps the first typed write for each item id. */
export function dedupeWrites(writes: readonly ItemValueWrite[]): ItemValueWrite[] {
  const seen = new Set<string>();
  return writes.filter((write) => {
    if (seen.has(write.id)) return false;
    seen.add(write.id);
    return true;
  });
}

/** Returns the settled result for a selection that has no mutations. */
export function emptyBulkResult(): BulkResult {
  return { applied: [], refused: [], undo: null };
}

/** Reads every displayed item before a bulk action begins any ledger entry. */
export function loadedItems(
  optimistic: OptimisticItems,
  ids: readonly string[]
): Map<string, WebItem> {
  const displayed = new Map<string, WebItem>();
  ids.forEach((id) => displayed.set(id, optimistic.displayed(id)));
  return displayed;
}

/** Converts a remembered previous placement into the fixed-placement model. */
export function previousFixedPlacement(item: WebItem): FixedPlacement | null {
  if (item.previousPlacement === null) return null;
  return item.previousPlacement.kind === 'location'
    ? { kind: 'location', locationId: item.previousPlacement.locationId }
    : { kind: 'container', containerId: item.previousPlacement.itemId };
}

/** Creates the optimistic patch used by fixed-placement verbs. */
export function fixedPlacementPatch(to: FixedPlacement) {
  return VERB_PATCHES.place(wirePlacement(to));
}

/** Creates the item.move command shared by move, store and putBack. */
export function commandForMove(
  to: InventoryPlacementTarget,
  verb: 'move' | 'store' | 'put_back'
): InventoryCommand {
  return { op: 'item.move', args: { to, verb } };
}

/** Returns a stable key for one fixed placement. */
export function placementKey(placement: FixedPlacement): string {
  return placement.kind === 'location'
    ? `location:${placement.locationId}`
    : `container:${placement.containerId}`;
}

/** Reads the catalogue revision required by stable typed commands. */
export function requireCatalogueRevision(catalogue: BulkCatalogue): number {
  if (catalogue.revision === null) {
    throw new Error('the published catalogue is not loaded');
  }
  return catalogue.revision;
}

/** Preserves the command's typed patch shape without changing a cached row. */
export const identityPatch = (item: WebItem): WebItem => item;
