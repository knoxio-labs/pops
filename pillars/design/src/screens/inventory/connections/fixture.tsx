import { coreWorld } from '@/fixtures/inventory/core';
import {
  houseConnections,
  laundryTap,
  studyPort,
  tvWallOutlet,
} from '@/fixtures/inventory/fixtures-house';
import { FixtureDetailPage } from '@/kit/inventory/fixtures/fixture-detail-page';
import { wiredItems } from '@/kit/inventory/fixtures/fixture-model';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { FixtureDetailPageProps } from '@/kit/inventory/fixtures/fixture-detail-page';

export const meta: ScreenMeta = { title: 'Fixture', order: 52, frame: 'web' };

const wiredToOutlet = wiredItems(tvWallOutlet.id, houseConnections, coreWorld);

function page(overrides: Partial<FixtureDetailPageProps> = {}) {
  return function FixtureState() {
    return (
      <FixtureDetailPage
        fixture={tvWallOutlet}
        world={coreWorld}
        wired={wiredToOutlet}
        {...overrides}
      />
    );
  };
}

/**
 * `/inventory/fixtures/:id`: one fixture and what is wired to it. The item
 * rows assume `GET /fixtures/:id/items` (POPS-42).
 */
export const states: ScreenStates = {
  unwired: page({ fixture: laundryTap, wired: [] }),
  'connect-item': page({
    fixture: studyPort,
    wired: wiredItems(studyPort.id, houseConnections, coreWorld),
    wireSeed: { query: 'o', picked: ['itm-console', 'itm-monitor'] },
  }),
  selected: page({ selected: ['itm-console', 'itm-soundbar'] }),
  disconnected: page({ disconnected: ['itm-soundbar'] }),
  edit: page({ editOpen: true }),
  loading: page({ status: 'loading' }),
  stale: page({ banner: 'stale' }),
  offline: page({ banner: 'offline' }),
};

export default page();
