/**
 * Placement scenarios the picker, move plan and drag states open on: who is
 * being placed, and what the picker should be showing when the state loads.
 */
import type { PickerSubject } from '../model/contracts';
import type { PlacementTarget } from '../model/model';

/** One ready-made placement question. */
export interface PlacementScenario {
  subject: PickerSubject;
  query?: string;
  drillId?: string | null;
}

/** Moving one item that sits on a desk. */
export const moveOneItem: PlacementScenario = { subject: { kind: 'items', ids: ['itm-lamp'] } };

/** Putting back an item picked up from the red toolbox. */
export const putBackTape: PlacementScenario = { subject: { kind: 'items', ids: ['itm-tape'] } };

/** An in-hand item whose previous place was deleted. */
export const previousDeleted: PlacementScenario = {
  subject: { kind: 'items', ids: ['itm-headphones'] },
};

/** A container being moved: its own contents must be refused as targets. */
export const moveContainer: PlacementScenario = { subject: { kind: 'items', ids: ['box-cables'] } };

/** Browsing one level down, inside the garage. */
export const drilledIntoGarage: PlacementScenario = {
  subject: { kind: 'items', ids: ['itm-lamp'] },
  drillId: 'loc-garage',
};

/** Typing a place that does not exist yet, so the picker offers to create it. */
export const creatingPlace: PlacementScenario = {
  subject: { kind: 'items', ids: ['itm-lamp'] },
  query: 'Linen press',
  drillId: 'loc-hall',
};

/** Moving a place: only locations, never itself or anything under it. */
export const moveGaragePlace: PlacementScenario = {
  subject: { kind: 'place', locationId: 'loc-workbench' },
  drillId: 'loc-garage',
};

/** A bulk move of five mixed rows, for the move plan. */
export const bulkMoveIds: readonly string[] = [
  'box-cables',
  'itm-lamp',
  'itm-speaker',
  'itm-drill',
  'itm-printer',
];

/** Targets the move plan states aim at. */
export const shelvingTarget: PlacementTarget = { kind: 'location', locationId: 'loc-shelving' };
export const deskTarget: PlacementTarget = { kind: 'location', locationId: 'loc-desk' };
export const closedBoxTarget: PlacementTarget = { kind: 'container', containerId: 'box-o04' };
export const fullBoxTarget: PlacementTarget = { kind: 'container', containerId: 'box-k12' };
export const ownContentsTarget: PlacementTarget = { kind: 'container', containerId: 'box-parts' };
