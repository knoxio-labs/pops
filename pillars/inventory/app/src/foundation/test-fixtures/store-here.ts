/** Store here targets and the extra full-container world used by its stories. */
import { buildWorld } from '../model/placement-model';
import { at, box, coreInventory, coreLocations } from './core';

import type { StoreHereTarget } from '../model/contracts';
import type { PlacementWorld } from '../model/placement-model';

/** An open linen box marked full. */
export const linen02 = box(['box-l02', 'Linen 02', 'type-box'], at('loc-hall-cupboard'), 'open', {
  code: 'L02',
  full: true,
});

/** The core house plus the full linen box. */
export const storeWorld: PlacementWorld = buildWorld([...coreInventory, linen02], coreLocations);

export const kitchen13Target: StoreHereTarget = {
  kind: 'container',
  id: 'box-k13',
  name: 'Kitchen 13',
  state: 'open',
};

export const office04Target: StoreHereTarget = {
  kind: 'container',
  id: 'box-o04',
  name: 'Office 04',
  state: 'closed',
};

export const linen02Target: StoreHereTarget = {
  kind: 'container',
  id: 'box-l02',
  name: 'Linen 02',
  state: 'full',
};

export const deskTarget: StoreHereTarget = { kind: 'location', id: 'loc-desk', name: 'Desk' };

/** Three things in hand, ticked together. */
export const multiPick: readonly string[] = ['itm-tape', 'itm-screw', 'box-bedside'];
