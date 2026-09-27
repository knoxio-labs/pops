import { FIXTURES_LIST_QUERY_KEY, fixtureItemsQueryKey } from '../../inventory-web/useFixtures.js';

import type { QueryKey } from '@tanstack/react-query';

/** Builds the cache key for one fixture's detail record. */
export function fixtureQueryKey(id: string): readonly ['inventory', 'fixtures', 'detail', string] {
  return ['inventory', 'fixtures', 'detail', id];
}

/** Lists the fixture and connection queries invalidated by a fixture change. */
export function fixtureInvalidationKeys(id?: string): readonly QueryKey[] {
  return [
    FIXTURES_LIST_QUERY_KEY,
    ['inventory', 'fixtures'],
    ['inventory', 'connections'],
    ...(id === undefined ? [] : [fixtureQueryKey(id), fixtureItemsQueryKey(id)]),
  ];
}
