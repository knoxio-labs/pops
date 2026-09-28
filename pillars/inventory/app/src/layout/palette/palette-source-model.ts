import {
  PALETTE_COMMANDS,
  placementArgumentCommand,
  purchaseRecordCommand,
  thisItemCommands,
} from './palette-commands.js';
import { purchasesPaletteSearchStatus } from './palette-search.js';

import type { PaletteStep } from '@pops/ui';

import type { ItemRowModel, PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PurchaseHit } from '../../inventory-web/purchase-model.js';
import type { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import type { PurchasesSearchState } from '../../inventory-web/usePurchasesSearch.js';
import type { InventoryPaletteCommand, PaletteScope } from './palette-groups.js';
import type { PaletteSearchState } from './palette-search.js';

/** Derives the visible state for the active palette step and search scope. */
export function paletteStatus({
  search,
  placement,
  query,
  scope,
  step,
  purchaseSearch,
}: {
  search: PaletteSearchState;
  purchaseSearch: PurchasesSearchState;
  placement: ReturnType<typeof usePlacementSources>;
  query: string;
  scope: PaletteScope;
  step: PaletteStep | null;
}) {
  if (step !== null) {
    if (placement.isLoading) return 'pending' as const;
    if (placement.isError) return { error: 'Placement destinations could not load.' } as const;
    return 'ready' as const;
  }
  if (query.trim() === '' && scope === 'inventory') return 'ready' as const;
  return scope === 'purchases'
    ? purchasesPaletteSearchStatus(query, search.debouncedQuery, purchaseSearch)
    : search.status;
}

/** Builds the fixed and item-specific commands for the current palette page. */
export function paletteCommands(item: ItemRowModel | undefined): InventoryPaletteCommand[] {
  return [...PALETTE_COMMANDS, ...(item === undefined ? [] : thisItemCommands(item))];
}

/** Projects purchase hits into navigable palette records. */
export function purchaseRecordCommands(hits: readonly PurchaseHit[]): InventoryPaletteCommand[] {
  return hits.map(purchaseRecordCommand);
}

/** Builds placement argument records for a Move command. */
export function placementArgumentCommands(
  targets: readonly Exclude<PlacementTarget, { kind: 'in-hand' }>[],
  world: PlacementWorld
): InventoryPaletteCommand[] {
  return targets.map((target) => placementArgumentCommand(target, world));
}
