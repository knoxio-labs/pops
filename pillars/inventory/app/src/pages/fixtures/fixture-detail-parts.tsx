import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../inventory-api-helpers.js';
import { fixturesGet } from '../../inventory-api/index.js';
import { fixtureQueryKey } from './fixture-query-keys.js';

import type { UseQueryResult } from '@tanstack/react-query';

import type { InventoryApiError } from '../../inventory-api-helpers.js';
import type { FixturesGetResponse } from '../../inventory-api/types.gen.js';
import type { FixtureDetail } from './fixture-model.js';

/** Reads one fixture under the shared fixture cache prefix without focus refetches. */
export function useFixture(id: string): UseQueryResult<FixtureDetail, InventoryApiError> {
  return useQuery<FixturesGetResponse, InventoryApiError, FixtureDetail>({
    queryKey: fixtureQueryKey(id),
    queryFn: async () => unwrap(await fixturesGet({ path: { id } })),
    enabled: id.length > 0,
    select: (envelope) => envelope.data,
    refetchOnWindowFocus: false,
  });
}
