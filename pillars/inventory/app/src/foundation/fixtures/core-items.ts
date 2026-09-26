/**
 * Named item fixtures cover grouped, untyped, in-hand, lifecycle, and sync
 * states used by inventory foundation tests and stories.
 */
import { at, inBox, inHand, item, wasAt, wasDeleted, wasIn } from './core-factory';

import type { ItemRowModel } from '../model/model';

const E = 'type-electronics';

export const television = item(['itm-tv', 'Television', E], at('loc-living'), { code: 'TV1' });
export const hdmiCables = item(['itm-hdmi', 'HDMI cable 2 m', 'type-cable'], at('loc-tv-drawer'), {
  quantity: 3,
});
export const usbcCables = item(['itm-usbc', 'USB-C cable 1 m', 'type-cable'], inBox('box-parts'), {
  quantity: 6,
});
export const plates = item(['itm-plates', 'Dinner plates', 'type-kitchen'], inBox('box-k12'), {
  quantity: 8,
});
export const drill = item(['itm-drill', 'Cordless drill', 'type-tools'], at('loc-workbench'), {
  code: 'D01',
});
export const tapeMeasure = item(['itm-tape', 'Tape measure', 'type-tools'], inHand, {
  previous: wasAt('loc-toolbox'),
});
export const screwdrivers = item(['itm-screw', 'Screwdriver set', 'type-tools'], inHand, {
  previous: wasIn('box-cables'),
});
export const headphones = item(['itm-headphones', 'Headphones', E], inHand, {
  previous: wasDeleted('Spare room'),
});
export const torch = item(['itm-torch', 'Torch', null], inHand);
export const router = item(['itm-router', 'Wi-Fi router', E], at('loc-filing'), {
  sync: 'needs-attention',
});
export const blender = item(['itm-blender', 'Blender', 'type-kitchen'], at('loc-kitchen'), {
  sync: 'stale',
});
export const speaker = item(['itm-speaker', 'Bluetooth speaker', E], at('loc-living'), {
  lifecycle: 'discarded',
});
export const umbrella = item(['itm-umbrella', 'Umbrella', null], at('loc-hall-cupboard'), {
  lifecycle: 'lost',
});
export const crackedPhone = item(['itm-phone', 'Cracked phone', E], at('loc-storage-bay'), {
  lifecycle: 'destroyed',
});
export const oldCamera = item(['itm-camera', 'Film camera', E], at('loc-storage-bay'), {
  lifecycle: 'retired',
});
export const longNamed = item(
  ['itm-long', 'Replacement filter cartridges for the under-sink water purifier', 'type-kitchen'],
  inBox('box-k13'),
  { quantity: 2, code: 'WF-2044' }
);

const everydayItems: readonly ItemRowModel[] = [
  item(['itm-soundbar', 'Soundbar', E], at('loc-tv-unit')),
  item(['itm-console', 'Game console', E], at('loc-tv-unit'), { sync: 'sending' }),
  item(['itm-charger', 'Laptop charger', 'type-cable'], inBox('box-cables')),
  item(['itm-kettle', 'Kettle', 'type-kitchen'], inBox('box-k13')),
  item(['itm-mugs', 'Mugs', 'type-kitchen'], inBox('box-k12'), { quantity: 6 }),
  item(['itm-knife', "Chef's knife", 'type-kitchen'], inBox('box-k12')),
  item(['itm-toaster', 'Toaster', 'type-kitchen'], at('loc-kitchen')),
  item(['itm-spices', 'Spice jars', 'type-kitchen'], at('loc-pantry'), { quantity: 12 }),
  item(['itm-monitor', 'Monitor 27 in', E], inBox('box-o04'), { code: 'M27' }),
  item(['itm-keyboard', 'Keyboard', E], inBox('box-o04')),
  item(['itm-lamp', 'Desk lamp', E], at('loc-desk')),
  item(['itm-printer', 'Label printer', E], at('loc-desk'), { code: 'P01' }),
  item(['itm-bits', 'Drill bit set', 'type-tools'], at('loc-toolbox')),
  item(['itm-ladder', 'Step ladder', null], at('loc-garage')),
  item(['itm-paperbacks', 'Paperbacks', 'type-books'], at('loc-bookshelf'), { quantity: 24 }),
  item(['itm-sheets', 'Spare sheets', 'type-linen'], inBox('box-bedside'), { quantity: 2 }),
  item(['itm-baubles', 'Baubles', null], inBox('box-xmas'), { quantity: 40 }),
  item(['itm-lights', 'Fairy lights', 'type-cable'], inBox('box-xmas')),
  item(['itm-chair', 'Office chair', 'type-furniture'], at('loc-study')),
  item(['itm-desk', 'Standing desk', 'type-furniture'], at('loc-study')),
  item(['itm-vacuum', 'Stick vacuum', E], at('loc-hall-cupboard'), { sync: 'queued' }),
  item(['itm-pots', 'Terracotta pots', null], at('loc-shelving'), { quantity: 4 }),
];

export const coreItems: readonly ItemRowModel[] = [
  television,
  hdmiCables,
  usbcCables,
  plates,
  drill,
  tapeMeasure,
  screwdrivers,
  headphones,
  torch,
  router,
  blender,
  speaker,
  umbrella,
  crackedPhone,
  oldCamera,
  longNamed,
  ...everydayItems,
];
