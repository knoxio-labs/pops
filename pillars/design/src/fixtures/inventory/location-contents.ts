/**
 * The places the Locations and location page states open on, and what is
 * selected or mid-drag in them. All of it reads the foundation world, so a
 * place here holds the same things it holds on every other screen.
 */
import type { PlacementTarget, SelectionState } from '@/kit/inventory/foundation';

/** The garage: two sub-places, two boxes (one closed and full), a loose ladder. */
export const GARAGE = 'loc-garage';

/** Shelving: a box inside a box, and pots. */
export const SHELVING = 'loc-shelving';

/** An empty cupboard, once the vacuum is out of it. */
export const HALL_CUPBOARD = 'loc-hall-cupboard';

/** Tree nodes open when a state loads: the house and the garage branch. */
export const OPEN_TO_GARAGE: readonly string[] = ['loc-house', 'loc-garage', 'loc-workbench'];

/** Two garage things selected in the panel. */
export function selected(ids: readonly string[], focusedId: string | null = null): SelectionState {
  return { selected: new Set(ids), anchorId: ids[0] ?? null, focusedId };
}

/** Garage's ladder and the Office 04 box, grabbed together. */
export const GRABBED_FROM_GARAGE: readonly string[] = ['box-o04', 'itm-ladder'];

/** Over Shelving, which takes them. */
export const OVER_SHELVING: PlacementTarget = { kind: 'location', locationId: SHELVING };
