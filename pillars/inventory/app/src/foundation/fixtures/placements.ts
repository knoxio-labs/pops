/**
 * Ready-made placement questions and targets used by picker and move tests.
 */
import type { PickerSubject } from '../model/contracts';
import type { PlacementTarget } from '../model/model';

/** One placement question opened by a fixture state. */
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

/** A container being moved; its own contents must be refused as targets. */
export const moveContainer: PlacementScenario = { subject: { kind: 'items', ids: ['box-cables'] } };

/** Browsing one level down inside the garage. */
export const drilledIntoGarage: PlacementScenario = {
  subject: { kind: 'items', ids: ['itm-lamp'] },
  drillId: 'loc-garage',
};

/** Typing a place that does not exist yet so the picker offers to create it. */
export const creatingPlace: PlacementScenario = {
  subject: { kind: 'items', ids: ['itm-lamp'] },
  query: 'Linen press',
  drillId: 'loc-hall',
};

/** Moving a place; only locations outside its subtree are valid targets. */
export const moveGaragePlace: PlacementScenario = {
  subject: { kind: 'place', locationId: 'loc-workbench' },
  drillId: 'loc-garage',
};

/** A bulk move of five mixed rows for the move plan. */
export const bulkMoveIds: readonly string[] = [
  'box-cables',
  'itm-lamp',
  'itm-speaker',
  'itm-drill',
  'itm-printer',
];

/** A target on the garage shelving. */
export const shelvingTarget: PlacementTarget = { kind: 'location', locationId: 'loc-shelving' };

/** A target on the study desk. */
export const deskTarget: PlacementTarget = { kind: 'location', locationId: 'loc-desk' };

/** A closed box target. */
export const closedBoxTarget: PlacementTarget = { kind: 'container', containerId: 'box-o04' };

/** A full box target. */
export const fullBoxTarget: PlacementTarget = { kind: 'container', containerId: 'box-k12' };

/** A container's own contents target. */
export const ownContentsTarget: PlacementTarget = { kind: 'container', containerId: 'box-parts' };
