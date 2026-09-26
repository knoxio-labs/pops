import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ITEMS_FILTERS,
  containersQuery,
  containersSearch,
  itemsQuery,
  itemsSearch,
  parseContainersFilters,
  parseItemsFilters,
} from './items-url-filters';

import type { ContainersUrlFilters, ItemsUrlFilters } from './items-url-filters';

describe('items URL filters', () => {
  it('writes only what differs from the defaults', () => {
    expect(
      itemsSearch({ ...DEFAULT_ITEMS_FILTERS, q: 'hdmi', typeKey: 'cable', view: 'cards' })
    ).toBe('?q=hdmi&type=cable&view=cards');
    expect(itemsSearch({ ...DEFAULT_ITEMS_FILTERS, untyped: true })).toBe('?untyped=1');
    expect(
      itemsSearch({
        ...DEFAULT_ITEMS_FILTERS,
        within: 'loc-garage',
        inactive: true,
        sort: 'updated',
      })
    ).toBe('?placement=loc-garage&inactive=1&sort=updated');
    expect(itemsSearch(DEFAULT_ITEMS_FILTERS)).toBe('');
  });

  it('round-trips trimmed filter values through the URL', () => {
    const filters: ItemsUrlFilters = {
      ...DEFAULT_ITEMS_FILTERS,
      q: 'hdmi',
      typeKey: 'cable',
      within: 'loc-garage',
      inactive: true,
      sort: 'where',
      view: 'compact',
    };

    expect(parseItemsFilters(new URLSearchParams(itemsSearch(filters).slice(1)))).toEqual(filters);

    const containers: ContainersUrlFilters = {
      ...filters,
      segment: 'moving',
    };
    expect(
      parseContainersFilters(new URLSearchParams(containersSearch(containers).slice(1)))
    ).toEqual({ ...containers, inactive: false });
  });

  it('ignores unknown parameters and falls back for invalid values', () => {
    const filters = parseContainersFilters(
      new URLSearchParams(
        'unknown=value&sort=bad&view=wide&state=sideways&untyped=0&type=&placement='
      )
    );

    expect(filters).toEqual({ ...DEFAULT_ITEMS_FILTERS, segment: 'all' });
  });

  it('lets exact untyped=1 win over a type parameter', () => {
    expect(parseItemsFilters(new URLSearchParams('untyped=1&type=cable'))).toMatchObject({
      untyped: true,
      typeKey: null,
    });
    expect(itemsSearch({ ...DEFAULT_ITEMS_FILTERS, untyped: true, typeKey: 'cable' })).toBe(
      '?untyped=1'
    );
  });

  it('trims and caps search text before serializing and querying', () => {
    const q = ` ${'x'.repeat(205)} `;
    const filters = { ...DEFAULT_ITEMS_FILTERS, q };
    const capped = 'x'.repeat(200);

    expect(itemsSearch(filters)).toBe(`?q=${capped}`);
    expect(itemsQuery(filters)).toEqual({ q: capped, sort: 'name' });
    expect(parseItemsFilters(new URLSearchParams(`q=${capped}`)).q).toBe(capped);
  });

  it('maps Items filters to the web-items query with the generated boolean encodings', () => {
    expect(
      itemsQuery({
        ...DEFAULT_ITEMS_FILTERS,
        q: ' cable ',
        typeKey: 'cable',
        within: 'loc-garage',
        inactive: true,
        sort: 'updated',
      })
    ).toEqual({
      q: 'cable',
      typeKey: 'cable',
      within: 'loc-garage',
      includeInactive: true,
      sort: 'updated',
    });
    expect(itemsQuery({ ...DEFAULT_ITEMS_FILTERS, untyped: true })).toEqual({
      untyped: 'true',
      sort: 'name',
    });
  });

  it('maps each container segment to its query and keeps inactive out', () => {
    const queries = new Map<ContainersUrlFilters['segment'], Record<string, string>>([
      ['all', { isContainer: 'true', sort: 'name' }],
      ['open', { isContainer: 'true', sort: 'name', access: 'open' }],
      ['closed', { isContainer: 'true', sort: 'name', access: 'closed' }],
      ['full', { isContainer: 'true', sort: 'name', isFull: 'true' }],
      ['moving', { isContainer: 'true', sort: 'packing' }],
      ['retired', { isContainer: 'true', sort: 'name', lifecycle: 'retired' }],
    ]);

    for (const [segment, expected] of queries) {
      expect(containersQuery({ ...DEFAULT_ITEMS_FILTERS, inactive: true, segment })).toEqual(
        expected
      );
    }
  });

  it('serializes a container state after the shared filter parameters', () => {
    expect(
      containersSearch({
        ...DEFAULT_ITEMS_FILTERS,
        q: 'box',
        sort: 'updated',
        segment: 'closed',
      })
    ).toBe('?q=box&sort=updated&state=closed');
  });
});
