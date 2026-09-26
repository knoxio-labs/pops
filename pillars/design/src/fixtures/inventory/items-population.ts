/**
 * A household-sized population for the browsers: names that fit their
 * types, placed in rooms and in numbered moving boxes, generated from a
 * fixed seed so every render and screenshot is the same. The foundation's
 * generator proves scale; this one has to read like a real list at a
 * glance, because the Items and Search screens are judged on how they read.
 */
import { at, box, inBox, item } from './core-factory';
import { mulberry32 } from './generator';

import type { ItemRowModel } from '@/kit/inventory/shared/model';

type Pools = Readonly<Record<string, readonly [readonly string[], readonly string[]]>>;

const POOLS: Pools = {
  'type-cable': [
    ['HDMI', 'USB-C', 'Ethernet', 'Lightning', 'Micro USB', 'Optical audio', 'Power'],
    ['cable 1 m', 'cable 2 m', 'cable 3 m', 'extension lead', 'adapter'],
  ],
  'type-kitchen': [
    ['Glass', 'Enamel', 'Cast iron', 'Bamboo', 'Ceramic', 'Stainless'],
    ['mixing bowl', 'saucepan', 'serving tray', 'chopping board', 'colander', 'jug'],
  ],
  'type-tools': [
    ['Makita', 'Ryobi', 'Stanley', 'Bosch', 'Irwin'],
    ['hammer', 'spirit level', 'hand saw', 'clamp set', 'stud finder', 'sander'],
  ],
  'type-electronics': [
    ['Sony', 'Philips', 'Logitech', 'Anker', 'JBL', 'Belkin'],
    ['power bank', 'webcam', 'desk speaker', 'e-reader', 'mouse', 'smart plug'],
  ],
  'type-books': [
    [''],
    [
      'Salt Fat Acid Heat',
      'The Overstory',
      'Field guide to birds',
      'Ottolenghi Simple',
      'Dune',
      'Middlemarch',
      'Street atlas',
    ],
  ],
  'type-linen': [
    ['Queen', 'Single', 'Linen', 'Cotton', 'Wool'],
    ['sheet set', 'doona cover', 'blanket', 'bath towels', 'pillowcases'],
  ],
};

const TYPES = Object.keys(POOLS);
const ROOMS = [
  'loc-living',
  'loc-study',
  'loc-kitchen',
  'loc-pantry',
  'loc-wardrobe',
  'loc-hall-cupboard',
  'loc-shelving',
  'loc-workbench',
  'loc-bookshelf',
];

function pick<T>(rng: () => number, values: readonly T[]): T {
  const value = values[Math.floor(rng() * values.length)];
  if (value === undefined) throw new Error('pick from an empty list');
  return value;
}

function movingBoxes(count: number, rng: () => number): ItemRowModel[] {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    const access = rng() > 0.45 ? 'closed' : 'open';
    return box(
      [`mb-${n}`, `Moving box ${n}`, 'type-box'],
      at(pick(rng, ['loc-garage', 'loc-storage-bay'])),
      access,
      {
        code: `MB${n}`,
        full: access === 'open' && rng() > 0.7,
        updatedAt: new Date(Date.UTC(2026, 8, 19) - index * 3_600_000).toISOString(),
      }
    );
  });
}

function householdItem(
  index: number,
  rng: () => number,
  boxes: readonly ItemRowModel[]
): ItemRowModel {
  const typeId = pick(rng, TYPES);
  const [first, second] = POOLS[typeId] ?? [[], []];
  const name = `${pick(rng, first)} ${pick(rng, second)}`.trim();
  const boxed = rng() > 0.5;
  const daysAgo = Math.floor(rng() * 400);
  return item(
    [`hh-${String(index).padStart(4, '0')}`, name, rng() > 0.08 ? typeId : null],
    boxed ? inBox(pick(rng, boxes).id) : at(pick(rng, ROOMS)),
    {
      quantity: rng() > 0.85 ? 2 + Math.floor(rng() * 5) : 1,
      code: rng() > 0.7 ? `H${String(1000 + index)}` : null,
      lifecycle: rng() > 0.96 ? 'retired' : 'active',
      updatedAt: new Date(Date.UTC(2026, 8, 18) - daysAgo * 86_400_000).toISOString(),
    }
  );
}

/** Moving boxes plus `count` household items, the same on every run. */
export function householdPopulation(count: number, seed = 42): ItemRowModel[] {
  const rng = mulberry32(seed);
  const boxes = movingBoxes(24, rng);
  const items = Array.from({ length: count }, (_, index) => householdItem(index, rng, boxes));
  return [...boxes, ...items];
}
