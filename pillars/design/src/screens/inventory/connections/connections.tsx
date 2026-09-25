import { coreWorld } from '@/fixtures/inventory/core';
import { houseConnections, houseFixtures } from '@/fixtures/inventory/fixtures-house';
import { connectionIndex } from '@/kit/inventory/connections/connection-model';
import { ConnectionsPage } from '@/kit/inventory/connections/connections-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ConnectionsPageProps } from '@/kit/inventory/connections/connections-page';

export const meta: ScreenMeta = { title: 'Connections', order: 50, frame: 'web' };

const index = connectionIndex(coreWorld, houseFixtures);

function page(overrides: Partial<ConnectionsPageProps> = {}) {
  return function ConnectionsState() {
    return <ConnectionsPage connections={houseConnections} index={index} {...overrides} />;
  };
}

/**
 * `/inventory/connections`: every connection in the house as a list, with
 * the graph a toggle away and the trace pane beside the list. Fixtures is
 * the second tab (`/inventory/connections/fixtures`).
 */
export const states: ScreenStates = {
  graph: page({ seed: { view: 'graph' } }),
  trace: page({ seed: { traceItemId: 'itm-tv', focusedId: 'cx-i1' } }),
  'connect-dialog': page({
    seed: { connectOpen: true },
    connectSeed: {
      fromKey: 'item:itm-lamp',
      toKind: 'fixture',
      toKey: 'fixture:fx-bedside-outlet',
    },
  }),
  'connect-refused': page({
    seed: { connectOpen: true },
    connectSeed: {
      fromKey: 'item:itm-tv',
      fromQuery: 'tele',
      toKind: 'item',
      toKey: 'item:itm-soundbar',
      toQuery: 'so',
    },
  }),
  'filtered-kind': page({ seed: { kind: 'fixture' } }),
  selected: page({ seed: { selected: ['cx-f3', 'cx-f7', 'cx-f8'], focusedId: 'cx-f8' } }),
  disconnected: page({ seed: { disconnected: ['cx-i1'] } }),
  empty: page({ connections: [] }),
  'empty-filtered': page({ seed: { query: 'dishwasher' } }),
  loading: page({ status: 'loading' }),
  error: page({ status: 'error' }),
  stale: page({ banner: 'stale' }),
  offline: page({ banner: 'offline' }),
};

export default page();
