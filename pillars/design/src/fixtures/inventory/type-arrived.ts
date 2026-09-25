/**
 * Garden, published in catalogue revision 13, claims the label "garden"
 * that five untyped items were filed under before it existed. One more
 * untyped item is filed differently and one garden item is retired, so the
 * match has something to leave out.
 */
import { at, inBox, item } from './core-factory';

import type { ArrivedType, UntypedItem } from '@/kit/inventory/type-arrived/type-arrived-model';

export const gardenType: ArrivedType = {
  id: 'type-garden',
  name: 'Garden',
  revision: 13,
  legacyLabels: ['garden', 'Garden tools'],
};

/** A type whose labels match nothing in the house. */
export const aquariumType: ArrivedType = {
  id: 'type-aquarium',
  name: 'Aquarium',
  revision: 14,
  legacyLabels: ['aquarium', 'fish tank'],
};

const untyped = (id: string, name: string, legacyLabel: string, placeId: string): UntypedItem => ({
  item: item([id, name, null], at(placeId)),
  legacyLabel,
});

export const untypedItems: readonly UntypedItem[] = [
  untyped('itm-pots', 'Terracotta pots', 'garden', 'loc-shelving'),
  untyped('itm-hose', 'Hose reel', 'Garden', 'loc-garage'),
  untyped('itm-secateurs', 'Secateurs', 'garden tools', 'loc-workbench'),
  untyped('itm-can', 'Watering can', 'garden', 'loc-garage'),
  {
    item: item(['itm-gloves', 'Gardening gloves', null], inBox('box-cables')),
    legacyLabel: 'garden',
  },
  untyped('itm-torch', 'Torch', 'camping', 'loc-hall-cupboard'),
  {
    item: item(['itm-rake', 'Old rake', null], at('loc-garage'), { lifecycle: 'retired' }),
    legacyLabel: 'garden',
  },
];
