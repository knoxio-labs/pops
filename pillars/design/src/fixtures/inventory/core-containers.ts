/**
 * The named containers: open, closed, full, nested, retired and one carried
 * in hand, which is every container state a screen has to draw.
 */
import { at, box, inBox, inHand, wasAt } from './core-factory';

import type { ItemRowModel } from '@/kit/inventory/shared/model';

export const kitchen12 = box(['box-k12', 'Kitchen 12', 'type-box'], at('loc-garage'), 'closed', {
  code: 'K12',
  full: true,
});
export const kitchen13 = box(['box-k13', 'Kitchen 13', 'type-box'], at('loc-kitchen'), 'open', {
  code: 'K13',
});
export const office04 = box(['box-o04', 'Office 04', 'type-box'], at('loc-garage'), 'closed', {
  code: 'O04',
});
export const christmasTub = box(
  ['box-xmas', 'Christmas tub', 'type-tub'],
  at('loc-storage-bay'),
  'closed',
  { code: 'T01' }
);
export const cableTub = box(['box-cables', 'Cable tub', 'type-tub'], at('loc-shelving'), 'open', {
  code: 'T02',
});
export const partsCase = box(
  ['box-parts', 'Small parts case', 'type-tub'],
  inBox('box-cables'),
  'open'
);
export const oldShoebox = box(['box-shoe', 'Old shoebox', 'type-box'], at('loc-wardrobe'), 'open', {
  lifecycle: 'retired',
});
export const bedsideBox = box(['box-bedside', 'Bedside box', 'type-box'], inHand, 'open', {
  previous: wasAt('loc-bedroom'),
});

export const coreContainers: readonly ItemRowModel[] = [
  kitchen12,
  kitchen13,
  office04,
  christmasTub,
  cableTub,
  partsCase,
  oldShoebox,
  bedsideBox,
];
