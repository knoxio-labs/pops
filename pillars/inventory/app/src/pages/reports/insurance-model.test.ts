import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import {
  insuranceCsv,
  insuranceGroups,
  insuranceSearch,
  parseInsuranceOptions,
} from './insurance-model.js';

import type { LocationModel } from '../../foundation/model/model.js';
import type { ReportEntry } from '../../inventory-web/useReportEntries.js';

const locations: LocationModel[] = [
  { id: 'house', name: 'House', parentId: null, kind: 'property' },
  { id: 'kitchen', name: 'Kitchen', parentId: 'house', kind: 'room' },
  { id: 'pantry', name: 'Pantry', parentId: 'kitchen', kind: 'storage' },
  { id: 'garage', name: 'Garage', parentId: 'house', kind: 'room' },
];

const world = buildWorld([], locations);

function entry(id: string, overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    code: null,
    effectiveLocationId: 'house',
    isContainer: false,
    itemId: id,
    name: id,
    photos: 1,
    place: 'House',
    purchasePrice: null,
    purchasedOn: null,
    quantity: 1,
    receiptId: null,
    replacementValue: null,
    room: { key: 'house', label: 'House' },
    typeKey: null,
    warrantyExpires: null,
    ...overrides,
  };
}

const entries: ReportEntry[] = [
  entry('Mugs', {
    effectiveLocationId: 'pantry',
    name: 'Mugs',
    photos: 1,
    place: 'Pantry',
    quantity: 6,
    replacementValue: 10,
    room: { key: 'kitchen', label: 'Kitchen' },
  }),
  entry('Kettle, "steel"', {
    effectiveLocationId: 'garage',
    name: 'Kettle, "steel"',
    photos: 0,
    place: 'Garage',
    replacementValue: 150,
    room: { key: 'garage', label: 'Garage' },
  }),
  entry('Drill', {
    code: 'D01',
    effectiveLocationId: 'garage',
    name: 'Drill',
    place: 'Garage',
    purchasedOn: '2025-01-01',
    receiptId: 42,
    replacementValue: 300,
    room: { key: 'garage', label: 'Garage' },
  }),
  entry('Torch', {
    effectiveLocationId: null,
    name: 'Torch',
    photos: 0,
    room: { key: 'in-hand', label: 'In hand' },
  }),
];

const all = { scopeId: null, sort: 'value' as const, gapsOnly: false };

describe('insuranceGroups', () => {
  it('groups by room in name order with In hand last and subtotals', () => {
    const groups = insuranceGroups(entries, world, all);

    expect(groups.map((group) => [group.room, group.subtotal])).toEqual([
      ['Garage', 450],
      ['Kitchen', 60],
      ['In hand', 0],
    ]);
    expect(groups[0]?.entries.map((entry) => entry.itemId)).toEqual(['Drill', 'Kettle, "steel"']);
  });

  it('limits to a place and everything under it', () => {
    const wholeHouse = insuranceGroups(entries, world, all);
    const garage = insuranceGroups(entries, world, { ...all, scopeId: 'garage' });

    expect(wholeHouse.flatMap((group) => group.entries.map((entry) => entry.itemId))).toContain(
      'Torch'
    );
    expect(garage.flatMap((group) => group.entries.map((entry) => entry.itemId))).toEqual([
      'Drill',
      'Kettle, "steel"',
    ]);
  });

  it('keeps only gaps, and sorts by name when asked', () => {
    const gaps = insuranceGroups(
      [
        ...entries,
        entry('Axe', {
          effectiveLocationId: 'garage',
          name: 'Axe',
          photos: 0,
          replacementValue: 1,
          room: { key: 'garage', label: 'Garage' },
        }),
      ],
      world,
      { ...all, gapsOnly: true, sort: 'name' }
    );

    expect(gaps.flatMap((group) => group.entries.map((entry) => entry.itemId))).toEqual([
      'Axe',
      'Kettle, "steel"',
      'Torch',
    ]);
  });

  it('can narrow gaps to one missing-evidence reason', () => {
    const unvalued = insuranceGroups(entries, world, {
      ...all,
      gapsOnly: true,
      gapReason: 'unvalued',
    });
    const withoutPhoto = insuranceGroups(entries, world, {
      ...all,
      gapsOnly: true,
      gapReason: 'without-photo',
    });

    expect(unvalued.flatMap((group) => group.entries.map((entry) => entry.itemId))).toEqual([
      'Torch',
    ]);
    expect(withoutPhoto.flatMap((group) => group.entries.map((entry) => entry.itemId))).toEqual([
      'Kettle, "steel"',
      'Torch',
    ]);
  });
});

describe('insuranceCsv', () => {
  it('writes one quoted-when-needed line per record, blanks for unknowns', () => {
    const csv = insuranceCsv(
      insuranceGroups(entries, world, { ...all, scopeId: 'garage', sort: 'name' })
    );

    expect(csv.split('\n')).toEqual([
      'Room,Place,Item,Code,Quantity,Unit value,Total value,Purchased,Warranty ends,Receipt,Photos',
      'Garage,Garage,Drill,D01,1,300,300,2025-01-01,,42,1',
      'Garage,Garage,"Kettle, ""steel""",,1,150,150,,,,0',
    ]);
  });
});

describe('insuranceSearch', () => {
  it('parses locationId, gaps and sort and writes only what differs', () => {
    expect(parseInsuranceOptions(new URLSearchParams())).toEqual({
      scopeId: null,
      gapsOnly: false,
      sort: 'value',
      gapReason: null,
    });
    expect(parseInsuranceOptions(new URLSearchParams('locationId=g&gaps=1&sort=name'))).toEqual({
      scopeId: 'g',
      gapsOnly: true,
      sort: 'name',
      gapReason: null,
    });
    expect(insuranceSearch({ scopeId: null, gapsOnly: false, sort: 'value' })).toBe('');
    expect(insuranceSearch({ scopeId: 'g', gapsOnly: true, sort: 'name' })).toBe(
      '?locationId=g&gaps=1&sort=name'
    );
    expect(
      insuranceSearch({
        scopeId: null,
        gapsOnly: true,
        gapReason: 'without-photo',
        sort: 'value',
      })
    ).toBe('?gaps=1&reason=without-photo');
  });
});
