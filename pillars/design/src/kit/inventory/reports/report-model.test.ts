import { at, box, inBox, inHand, item } from '@/fixtures/inventory/core-factory';
import { buildWorld } from '@/kit/inventory/foundation';
import { describe, expect, it } from 'vitest';

import { insuranceCsv, insuranceGroups } from './insurance-model';
import {
  breakdown,
  entryValue,
  formatDollars,
  reportEntries,
  reportTotals,
  roomOf,
} from './report-model';

import type { LocationModel } from '@/kit/inventory/foundation';

import type { Provenance } from './report-model';

const locations: LocationModel[] = [
  { id: 'house', name: 'House', parentId: null, kind: 'property' },
  { id: 'kitchen', name: 'Kitchen', parentId: 'house', kind: 'room' },
  { id: 'pantry', name: 'Pantry', parentId: 'kitchen', kind: 'storage' },
  { id: 'garage', name: 'Garage', parentId: 'house', kind: 'room' },
];

const world = buildWorld(
  [
    item(['mugs', 'Mugs', 'type-kitchen'], at('pantry'), { quantity: 6 }),
    item(['kettle', 'Kettle, "steel"', 'type-kitchen'], inBox('crate')),
    item(['drill', 'Drill', 'type-tools'], at('garage'), { code: 'D01' }),
    item(['torch', 'Torch', null], inHand),
    item(['camera', 'Camera', null], at('garage'), { lifecycle: 'retired' }),
    box(['crate', 'Crate', 'type-box'], at('garage'), 'open'),
    box(['safe', 'Safe', 'type-box'], at('kitchen'), 'closed'),
  ],
  locations
);

const p = (itemId: string, replacementValue: number | null, photos = 1): Provenance => ({
  itemId,
  replacementValue,
  purchasePrice: replacementValue === null ? null : replacementValue - 1,
  purchasedOn: '2025-01-01',
  merchant: null,
  warrantyExpires: null,
  receiptId: itemId === 'drill' ? 42 : null,
  photos,
});

const provenance = [
  p('mugs', 10),
  p('kettle', 150, 0),
  p('drill', 300),
  p('camera', 999),
  p('safe', 400),
  p('crate', null),
];
const entries = reportEntries(world, provenance);

describe('reportEntries', () => {
  it('counts active items, and containers only when they have a value', () => {
    expect(entries.map((entry) => entry.item.id).toSorted()).toEqual([
      'drill',
      'kettle',
      'mugs',
      'safe',
      'torch',
    ]);
  });

  it('keeps an item with no provenance, unvalued', () => {
    const torch = entries.find((entry) => entry.item.id === 'torch');
    expect(torch?.provenance).toBeNull();
    expect(torch && entryValue(torch)).toBeNull();
  });
});

describe('reportTotals', () => {
  it('multiplies by quantity and counts gaps', () => {
    expect(reportTotals(entries)).toEqual({
      records: 5,
      units: 10,
      replacement: 60 + 150 + 300 + 400,
      purchase: 54 + 149 + 299 + 399,
      unvalued: 1,
      withoutPhoto: 2,
    });
  });

  it('is all zeros for nothing', () => {
    expect(reportTotals([]).records).toBe(0);
  });
});

describe('roomOf', () => {
  it('follows containers to the room below the property, and names in hand', () => {
    expect(roomOf(world, 'kettle').name).toBe('Garage');
    expect(roomOf(world, 'mugs').name).toBe('Kitchen');
    expect(roomOf(world, 'torch')).toEqual({ id: 'in-hand', name: 'In hand' });
  });
});

describe('breakdown', () => {
  it('groups by room, largest first, with shares of the valued total', () => {
    const rooms = breakdown(entries, world, 'room');
    expect(rooms.map((group) => [group.label, group.value])).toEqual([
      ['Kitchen', 460],
      ['Garage', 450],
      ['In hand', 0],
    ]);
    expect(rooms[0]?.share).toBeCloseTo(460 / 910);
    expect(rooms[2]?.unvalued).toBe(1);
  });

  it('groups by type with Untyped for untyped items and orders entries by value', () => {
    const types = breakdown(entries, world, 'type', 'purchase');
    const kitchen = types.find((group) => group.label === 'Kitchenware');
    expect(kitchen?.entries.map((entry) => entry.item.id)).toEqual(['kettle', 'mugs']);
    expect(types.at(-1)?.label).toBe('Untyped');
  });

  it('shares nothing when nothing is valued', () => {
    const [only] = breakdown(
      entries.filter((entry) => entry.item.id === 'torch'),
      world,
      'room'
    );
    expect(only?.share).toBe(0);
  });
});

describe('insuranceGroups', () => {
  const all = { scopeId: null, sort: 'value' as const, gapsOnly: false };

  it('groups by room in name order with In hand last and subtotals', () => {
    const groups = insuranceGroups(entries, world, all);
    expect(groups.map((group) => [group.room, group.subtotal])).toEqual([
      ['Garage', 450],
      ['Kitchen', 460],
      ['In hand', 0],
    ]);
    expect(groups[0]?.entries.map((entry) => entry.item.id)).toEqual(['drill', 'kettle']);
  });

  it('limits to a place and everything under it', () => {
    const pantry = insuranceGroups(entries, world, { ...all, scopeId: 'pantry' });
    expect(pantry.flatMap((group) => group.entries.map((entry) => entry.item.id))).toEqual([
      'mugs',
    ]);
  });

  it('keeps only gaps, and sorts by name when asked', () => {
    const gaps = insuranceGroups(entries, world, { ...all, gapsOnly: true, sort: 'name' });
    expect(gaps.flatMap((group) => group.entries.map((entry) => entry.item.id))).toEqual([
      'kettle',
      'torch',
    ]);
  });
});

describe('insuranceCsv', () => {
  it('writes one quoted-when-needed line per record, blanks for unknowns', () => {
    const csv = insuranceCsv(
      insuranceGroups(entries, world, { scopeId: 'garage', sort: 'name', gapsOnly: false }),
      world
    );
    expect(csv.split('\n')).toEqual([
      'Room,Place,Item,Code,Quantity,Unit value,Total value,Purchased,Warranty ends,Receipt,Photos',
      'Garage,Garage,Drill,D01,1,300,300,2025-01-01,,42,1',
      'Garage,Garage,"Kettle, ""steel""",,1,150,150,2025-01-01,,,0',
    ]);
  });
});

describe('formatDollars', () => {
  it('rounds and groups thousands', () => {
    expect(formatDollars(22575.4)).toBe('$22,575');
    expect(formatDollars(0)).toBe('$0');
  });
});
