import { coreWorld } from '@/fixtures/inventory/core';
import { houseConnections, houseFixtures } from '@/fixtures/inventory/fixtures-house';
import { NO_FIXTURE_FILTER } from '@/kit/inventory/fixtures/fixture-model';
import { FixturesPage } from '@/kit/inventory/fixtures/fixtures-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { FixturesPageProps } from '@/kit/inventory/fixtures/fixtures-page';

export const meta: ScreenMeta = { title: 'Fixtures', order: 51, frame: 'web' };

function page(overrides: Partial<FixturesPageProps> = {}) {
  return function FixturesState() {
    return (
      <FixturesPage
        fixtures={houseFixtures}
        connections={houseConnections}
        world={coreWorld}
        {...overrides}
      />
    );
  };
}

/**
 * `/inventory/connections/fixtures`: the Fixtures tab of Connections. The
 * file name keeps the Connections nav item lit, which is where this tab lives.
 */
export const states: ScreenStates = {
  filtered: page({ filter: { ...NO_FIXTURE_FILTER, kind: 'power' } }),
  'new-fixture': page({ newOpen: true }),
  empty: page({ fixtures: [], connections: [] }),
  'empty-filtered': page({ filter: { ...NO_FIXTURE_FILTER, query: 'dishwasher' } }),
  loading: page({ status: 'loading' }),
  error: page({ status: 'error' }),
  stale: page({ banner: 'stale' }),
  offline: page({ banner: 'offline' }),
};

export default page();
