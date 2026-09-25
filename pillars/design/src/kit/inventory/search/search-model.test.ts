import { coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import {
  exactCode,
  resultCount,
  resultOrder,
  searchInventory,
  stepActive,
  typeaheadRows,
} from './search-model';

const itemIds = (query: string, filters?: Parameters<typeof searchInventory>[2]) =>
  searchInventory(coreWorld, query, filters).items.map((hit) => hit.item.id);

describe('searchInventory', () => {
  it('returns nothing for an empty query', () => {
    expect(resultCount(searchInventory(coreWorld, '   '))).toBe(0);
  });

  it('pins an exact code first, ignoring case, and not again below', () => {
    const results = searchInventory(coreWorld, 'k12');
    expect(results.exact?.id).toBe('box-k12');
    expect(results.items.map((hit) => hit.item.id)).not.toContain('box-k12');
    expect(resultOrder(results)[0]).toBe('box-k12');
  });

  it('does not treat a code prefix as exact', () => {
    expect(exactCode(coreWorld.items.values(), 'K1')).toBeNull();
    expect(exactCode(coreWorld.items.values(), '')).toBeNull();
  });

  it('ranks name prefix, then name contains, then other fields', () => {
    const hits = searchInventory(coreWorld, 'cable').items;
    const tiers = hits.map((hit) => hit.tier);
    expect(tiers).toEqual(
      [...tiers].toSorted(
        (a, b) =>
          ['prefix', 'contains', 'other'].indexOf(a) - ['prefix', 'contains', 'other'].indexOf(b)
      )
    );
    expect(hits.find((hit) => hit.item.id === 'box-cables')?.tier).toBe('prefix');
    expect(hits.find((hit) => hit.item.id === 'itm-hdmi')?.tier).toBe('prefix');
    expect(hits.find((hit) => hit.item.id === 'itm-charger')).toMatchObject({
      tier: 'other',
      field: 'type',
    });
  });

  it('finds items by the place they sit in and says so', () => {
    const hit = searchInventory(coreWorld, 'workbench').items.find(
      (candidate) => candidate.item.id === 'itm-drill'
    );
    expect(hit).toMatchObject({ tier: 'other', field: 'place' });
  });

  it('matches a code as another field when it is not exact', () => {
    const hit = searchInventory(coreWorld, 'WF-20').items.find(
      (candidate) => candidate.item.id === 'itm-long'
    );
    expect(hit).toMatchObject({ tier: 'other', field: 'code' });
  });

  it('puts inactive items after active ones in the same tier', () => {
    const ids = itemIds('b');
    expect(ids.indexOf('itm-speaker')).toBeGreaterThan(ids.indexOf('itm-blender'));
  });

  it('applies the Type and Placement filters, and hides places under a Type filter', () => {
    expect(itemIds('cable', { typeId: 'type-cable', within: null })).not.toContain('box-cables');
    expect(itemIds('cable', { typeId: null, within: 'box-cables' })).toEqual(
      expect.arrayContaining(['itm-usbc', 'itm-charger'])
    );
    expect(itemIds('cable', { typeId: null, within: 'box-cables' })).not.toContain('itm-hdmi');
    expect(
      searchInventory(coreWorld, 'garage', { typeId: 'type-tools', within: null }).places
    ).toEqual([]);
  });

  it('returns places by name, prefix first', () => {
    const places = searchInventory(coreWorld, 'room').places.map((hit) => hit.place.id);
    expect(places).toEqual(expect.arrayContaining(['loc-living', 'loc-bedroom']));
    expect(searchInventory(coreWorld, 'gar').places[0]).toMatchObject({
      place: { id: 'loc-garage' },
      tier: 'prefix',
    });
  });
});

describe('stepActive', () => {
  const order = ['a', 'b', 'c'];
  it('moves and clamps at both ends', () => {
    expect(stepActive(order, 'a', 1)).toBe('b');
    expect(stepActive(order, 'c', 1)).toBe('c');
    expect(stepActive(order, 'a', -1)).toBe('a');
  });
  it('starts at the top when nothing or a vanished row is active', () => {
    expect(stepActive(order, null, 1)).toBe('a');
    expect(stepActive(order, 'gone', -1)).toBe('a');
    expect(stepActive([], 'a', 1)).toBeNull();
  });
});

describe('resultOrder', () => {
  it('draws name matches, then places, then matches elsewhere', () => {
    const order = resultOrder(searchInventory(coreWorld, 'garage'));
    const garage = order.indexOf('loc-garage');
    expect(garage).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('itm-drill')).toBeGreaterThan(garage);
    const cable = resultOrder(searchInventory(coreWorld, 'cable'));
    expect(cable.indexOf('itm-hdmi')).toBeLessThan(cable.indexOf('itm-charger'));
  });
});

describe('typeaheadRows', () => {
  const idOf = (row: ReturnType<typeof typeaheadRows>[number]) =>
    row.kind === 'item' ? row.hit.item.id : row.place.id;

  it('is a prefix of the page order, capped', () => {
    const results = searchInventory(coreWorld, 'garage');
    const rows = typeaheadRows(results, 4);
    expect(rows).toHaveLength(4);
    expect(rows.map(idOf)).toEqual(resultOrder(results).slice(0, 4));
  });

  it('marks the exact code row', () => {
    const [first] = typeaheadRows(searchInventory(coreWorld, 'K12'));
    expect(first).toMatchObject({ kind: 'item', exact: true, hit: { item: { id: 'box-k12' } } });
  });

  it('is empty for an empty query', () => {
    expect(typeaheadRows(searchInventory(coreWorld, ''))).toEqual([]);
  });
});
