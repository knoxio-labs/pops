import type { Placement } from '../../foundation/model/model';
import type { InventoryPlacementTarget } from '../../inventory-web/commands.js';

/** Maps the form placement model to the inventory mutation wire shape. */
export function wirePlacement(placement: Placement): InventoryPlacementTarget {
  if (placement.kind === 'in-hand') return { kind: 'hand' };
  if (placement.kind === 'location') return { kind: 'location', locationId: placement.locationId };
  return { kind: 'container', itemId: placement.containerId };
}
