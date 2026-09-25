import { coreInventory, coreItem, coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  hiddenInactive,
  isNarrowed,
  itemsQuery,
  sitsWithin,
} from './browse-model';

import type { ItemsFilters } from './browse-model';

const run = (patch: Partial<ItemsFilters>) =>
  applyFilters(coreInventory, coreWorld, { ...DEFAULT_FILTERS, ...patch }).map((item) => item.id);

describe('applyFilters', () => {
  it('hides inactive items unless asked', () => {
    expect(run({})).not.toContain('itm-speaker');
    expect(run({})).not.toContain('itm-phone');
    expect(run({ inactive: true })).toContain('itm-speaker');
    expect(run({ inactive: true })).toContain('itm-phone');
  });

  it('keeps only one type, or only untyped items', () => {
    const cables = run({ typeId: 'type-cable' });
    expect(cables).toEqual(expect.arrayContaining(['itm-hdmi', 'itm-usbc', 'itm-charger']));
    expect(cables.every((id) => coreWorld.items.get(id)?.typeId === 'type-cable')).toBe(true);
    const untyped = run({ untyped: true, typeId: 'type-cable' });
    expect(untyped).toContain('itm-torch');
    expect(untyped.every((id) => coreWorld.items.get(id)?.typeId === null)).toBe(true);
  });

  it('keeps what sits anywhere under a location, through containers', () => {
    const garage = run({ within: 'loc-garage' });
    expect(garage).toContain('itm-drill');
    expect(garage).toContain('box-k12');
    expect(garage).toContain('itm-plates');
    expect(garage).not.toContain('itm-tv');
  });

  it('keeps a container’s nested contents but never the container itself', () => {
    const tub = run({ within: 'box-cables' });
    expect(tub).toEqual(expect.arrayContaining(['itm-charger', 'box-parts', 'itm-usbc']));
    expect(tub).not.toContain('box-cables');
    expect(sitsWithin(coreWorld, coreItem('itm-tv'), 'box-cables')).toBe(false);
  });

  it('never places an in-hand item under a location', () => {
    expect(run({ within: 'loc-house' })).not.toContain('itm-tape');
  });

  it('ranks a name prefix over a contained match over another field', () => {
    const prefix = run({ q: 'cab' });
    const lastPrefix = Math.max(
      ...['box-cables', 'itm-hdmi', 'itm-usbc'].map((id) => prefix.indexOf(id))
    );
    expect(lastPrefix).toBeLessThan(prefix.indexOf('itm-charger'));
    const contains = run({ q: 'able' });
    expect(contains.indexOf('box-cables')).toBeLessThan(contains.indexOf('itm-charger'));
    expect(contains.indexOf('itm-charger')).toBeGreaterThan(-1);
  });

  it('finds a code without the name matching', () => {
    expect(run({ q: 'k12' })).toEqual(['box-k12']);
  });

  it('drops rows that match nothing', () => {
    expect(run({ q: 'zzzz' })).toEqual([]);
  });

  it('sorts by the chosen key when nothing is typed', () => {
    const byName = run({});
    expect(byName).toEqual(
      [...byName].toSorted((a, b) =>
        (coreWorld.items.get(a)?.name ?? '').localeCompare(coreWorld.items.get(b)?.name ?? '')
      )
    );
    const byType = run({ sort: 'type' });
    expect(coreWorld.items.get(byType.at(-1) ?? '')?.typeName).toBeNull();
  });
});

describe('counts and the address', () => {
  it('counts narrowing filters but not the text or the sort', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, q: 'x', sort: 'updated' })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, untyped: true, within: 'loc-garage' })).toBe(2);
    expect(isNarrowed({ ...DEFAULT_FILTERS, q: ' ' })).toBe(false);
    expect(isNarrowed({ ...DEFAULT_FILTERS, q: 'x' })).toBe(true);
  });

  it('counts the inactive rows the default view hides', () => {
    expect(hiddenInactive(coreInventory, coreWorld, DEFAULT_FILTERS)).toBe(5);
    const electronics = { ...DEFAULT_FILTERS, typeId: 'type-electronics' };
    expect(hiddenInactive(coreInventory, coreWorld, electronics)).toBe(3);
    expect(hiddenInactive(coreInventory, coreWorld, { ...electronics, inactive: true })).toBe(0);
  });

  it('writes only what differs from the defaults', () => {
    expect(itemsQuery(DEFAULT_FILTERS)).toBe('');
    expect(itemsQuery({ ...DEFAULT_FILTERS, q: ' hdmi ', typeId: 'type-cable' }, 'cards')).toBe(
      '?q=hdmi&type=type-cable&view=cards'
    );
    expect(itemsQuery({ ...DEFAULT_FILTERS, untyped: true, typeId: 'type-cable' })).toBe(
      '?untyped=1'
    );
    expect(
      itemsQuery({ ...DEFAULT_FILTERS, within: 'loc-garage', inactive: true, sort: 'updated' })
    ).toBe('?placement=loc-garage&inactive=1&sort=updated');
  });
});
