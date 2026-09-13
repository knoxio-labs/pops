import { describe, expect, it } from 'vitest';

import { buildInsuranceReport } from './report-model';

import type { LocationTreeNode } from '../location-picker';
import type { SortableReportItem } from './report-model';

const TREE: LocationTreeNode[] = [
  {
    id: 'house',
    name: 'House',
    parentId: null,
    children: [
      { id: 'kitchen', name: 'Kitchen', parentId: 'house', children: [] },
      { id: 'study', name: 'Study', parentId: 'house', children: [] },
    ],
  },
  { id: 'storage', name: 'Storage', parentId: null, children: [] },
];

function item(overrides: Partial<SortableReportItem>): SortableReportItem {
  return {
    id: 'item',
    itemName: 'Item',
    assetId: null,
    brand: null,
    condition: null,
    type: null,
    warrantyExpires: null,
    replacementValue: null,
    photoPath: null,
    locationId: null,
    locationName: null,
    receiptDocumentIds: [],
    ...overrides,
  };
}

describe('buildInsuranceReport', () => {
  it('groups items by locationId and names the null-location group "No Location"', () => {
    const items = [
      item({ id: 'a', locationId: 'kitchen', locationName: 'Kitchen' }),
      item({ id: 'b', locationId: null }),
    ];
    const report = buildInsuranceReport(items, TREE);
    expect(report.groups.map((g) => g.locationName)).toEqual(['Kitchen', 'No Location']);
  });

  it('sorts the null-location group last regardless of name', () => {
    const items = [
      item({ id: 'a', locationId: null }),
      item({ id: 'b', locationId: 'kitchen', locationName: 'Kitchen' }),
    ];
    const report = buildInsuranceReport(items, TREE);
    expect(report.groups.map((g) => g.locationId)).toEqual(['kitchen', null]);
  });

  it('sums totalValue treating a null replacementValue as zero', () => {
    const items = [
      item({ id: 'a', locationId: 'kitchen', locationName: 'Kitchen', replacementValue: 100 }),
      item({ id: 'b', locationId: 'kitchen', locationName: 'Kitchen', replacementValue: null }),
    ];
    const report = buildInsuranceReport(items, TREE);
    expect(report.totalValue).toBe(100);
    expect(report.totalItems).toBe(2);
  });

  it('filters to exactly one location when includeChildren is false', () => {
    const items = [
      item({ id: 'a', locationId: 'house', locationName: 'House' }),
      item({ id: 'b', locationId: 'kitchen', locationName: 'Kitchen' }),
    ];
    const report = buildInsuranceReport(items, TREE, {
      locationId: 'house',
      includeChildren: false,
    });
    expect(report.groups.map((g) => g.locationId)).toEqual(['house']);
  });

  it('includes every descendant location when includeChildren is true', () => {
    const items = [
      item({ id: 'a', locationId: 'house', locationName: 'House' }),
      item({ id: 'b', locationId: 'kitchen', locationName: 'Kitchen' }),
      item({ id: 'c', locationId: 'storage', locationName: 'Storage' }),
    ];
    const report = buildInsuranceReport(items, TREE, {
      locationId: 'house',
      includeChildren: true,
    });
    expect(report.groups.map((g) => g.locationId).toSorted()).toEqual(['house', 'kitchen']);
  });

  it('drops every item when filtered to a location with none, rather than falling back to unfiltered', () => {
    const items = [item({ id: 'a', locationId: 'kitchen', locationName: 'Kitchen' })];
    const report = buildInsuranceReport(items, TREE, { locationId: 'storage' });
    expect(report.groups).toEqual([]);
    expect(report.totalItems).toBe(0);
  });

  it('sorts by value descending by default, treating null as lowest', () => {
    const items = [
      item({ id: 'a', locationId: 'kitchen', locationName: 'Kitchen', replacementValue: 10 }),
      item({ id: 'b', locationId: 'kitchen', locationName: 'Kitchen', replacementValue: 50 }),
      item({ id: 'c', locationId: 'kitchen', locationName: 'Kitchen', replacementValue: null }),
    ];
    const report = buildInsuranceReport(items, TREE);
    expect(report.groups[0]?.items.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by name and by type when asked', () => {
    const items = [
      item({
        id: 'a',
        locationId: 'kitchen',
        locationName: 'Kitchen',
        itemName: 'Zebra',
        type: 'B',
      }),
      item({
        id: 'b',
        locationId: 'kitchen',
        locationName: 'Kitchen',
        itemName: 'Apple',
        type: 'A',
      }),
    ];
    expect(
      buildInsuranceReport(items, TREE, { sortBy: 'name' }).groups[0]?.items.map((i) => i.id)
    ).toEqual(['b', 'a']);
    expect(
      buildInsuranceReport(items, TREE, { sortBy: 'type' }).groups[0]?.items.map((i) => i.id)
    ).toEqual(['b', 'a']);
  });
});
