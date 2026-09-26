import { describe, expect, it, vi } from 'vitest';

import { at, item } from '../test-fixtures/core-factory';
import {
  activeFilterCount,
  filterChips,
  isNarrowed,
  placeFilterOptions,
  typeFilterOptions,
} from './list-filters';

import type { ItemsUrlFilters } from '../../inventory-web/items-url-filters';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups';

const baseFilters: ItemsUrlFilters = {
  q: '',
  typeKey: null,
  untyped: false,
  inactive: false,
  within: null,
  sort: 'name',
  view: 'table',
};

function catalogueType(
  key: string,
  label: string,
  sortOrder: number,
  archivedAt: string | null = null
): CatalogueType {
  return {
    id: `type-${key}`,
    key,
    label,
    sortOrder,
    archivedAt,
    capabilities: [],
    description: null,
    fields: [],
    legacyLabels: [],
    presentation: {},
    replacedBy: null,
    revision: 1,
  };
}

describe('list filters', () => {
  it('counts narrowing filters but not the text or the sort', () => {
    expect(activeFilterCount(baseFilters)).toBe(0);
    expect(isNarrowed({ ...baseFilters, q: '  cable  ', sort: 'where', view: 'cards' })).toBe(true);
    expect(
      activeFilterCount({
        ...baseFilters,
        q: 'cable',
        typeKey: 'cable',
        within: 'garage',
        inactive: true,
        sort: 'updated',
      })
    ).toBe(3);
  });

  it('builds type options from non-archived published types by key', () => {
    expect(
      typeFilterOptions([
        catalogueType('zeta', 'Zeta', 2),
        catalogueType('old', 'Old', 1, '2026-09-01T00:00:00.000Z'),
        catalogueType('alpha', 'Alpha', 1),
      ])
    ).toEqual([
      { value: 'alpha', label: 'Alpha' },
      { value: 'zeta', label: 'Zeta' },
    ]);
  });

  it('labels places with their path below the top level, then containers', () => {
    const locations = [
      { id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const },
      { id: 'shelf', name: 'Shelving', parentId: 'garage', kind: 'furniture' as const },
      { id: 'drawer', name: 'Drawer', parentId: 'shelf', kind: 'storage' as const },
    ];
    const options = placeFilterOptions(locations, [
      item(['active-box', 'Active box', null], at('garage'), {
        container: { access: 'open', full: false },
      }),
      item(['old-box', 'Old box', null], at('garage'), {
        lifecycle: 'retired',
        container: { access: 'closed', full: false },
      }),
    ]);

    expect(options).toEqual([
      { value: 'garage', label: 'Garage' },
      { value: 'shelf', label: 'Shelving' },
      { value: 'drawer', label: 'Shelving › Drawer' },
      { value: 'active-box', label: 'Active box (container)' },
    ]);
  });

  it('names each active filter as a removable chip', () => {
    const set = vi.fn<(patch: Partial<ItemsUrlFilters>) => void>();
    const chips = filterChips(
      {
        ...baseFilters,
        typeKey: 'cable',
        within: 'garage',
        inactive: true,
      },
      [{ value: 'cable', label: 'Cable' }],
      [{ value: 'garage', label: 'Garage' }],
      set
    );

    expect(chips.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'type', label: 'Type: Cable' },
      { id: 'within', label: 'In Garage' },
      { id: 'inactive', label: 'Including inactive' },
    ]);
    chips.forEach((chip) => chip.onRemove());
    expect(set.mock.calls.map(([patch]) => patch)).toEqual([
      { typeKey: null },
      { within: null },
      { inactive: false },
    ]);
  });
});
