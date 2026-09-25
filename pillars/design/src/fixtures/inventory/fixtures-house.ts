/**
 * The house's fixtures and every connection between the core items and to
 * those fixtures. The living room is the busy corner (a television chain
 * reaching the study through the router); the laundry tap and the hall
 * switch are wired to nothing, so the unwired state is real data.
 */
import type { ConnectionModel, FixtureModel } from '@/kit/inventory/fixtures/fixture-model';

const fixture = (
  [id, name, kind, locationId]: readonly [string, string, FixtureModel['kind'], string],
  note: string | null = null
): FixtureModel => ({ id, name, kind, locationId, note, addedAt: '2026-08-02T09:00:00.000Z' });

export const tvWallOutlet = fixture(
  ['fx-tv-outlet', 'TV wall double outlet', 'power', 'loc-living'],
  'Behind the TV unit, left of the antenna point.'
);
export const antennaPoint = fixture(['fx-antenna', 'TV antenna point', 'antenna', 'loc-living']);
export const studyPort = fixture(
  ['fx-study-port', 'Study network port', 'network', 'loc-study'],
  'Patched to port 4 in the hall cupboard.'
);
export const laundryTap = fixture(['fx-laundry-tap', 'Laundry cold tap', 'water', 'loc-garage']);

/** Every fixture in the house. */
export const houseFixtures: readonly FixtureModel[] = [
  tvWallOutlet,
  antennaPoint,
  fixture(['fx-living-light', 'Living room ceiling light', 'light', 'loc-living']),
  fixture(['fx-desk-outlet', 'Desk double outlet', 'power', 'loc-study']),
  studyPort,
  fixture(['fx-bench-outlet', 'Bench outlet by the window', 'power', 'loc-kitchen']),
  fixture(['fx-pendants', 'Pendant lights over the bench', 'light', 'loc-kitchen']),
  fixture(['fx-bedside-outlet', 'Bedside outlet', 'power', 'loc-bedroom']),
  fixture(['fx-hall-switch', 'Hall light switch', 'switch', 'loc-hall']),
  fixture(
    ['fx-workbench-outlet', 'Workbench outlet', 'power', 'loc-workbench'],
    '15 A, for the compressor and chargers.'
  ),
  laundryTap,
];

type Edge = readonly [itemId: string, to: string, createdOn: string];

const itemEdges: readonly Edge[] = [
  ['itm-tv', 'itm-soundbar', '2026-08-03'],
  ['itm-tv', 'itm-console', '2026-08-03'],
  ['itm-console', 'itm-router', '2026-08-04'],
  ['itm-monitor', 'itm-keyboard', '2026-08-10'],
  ['itm-drill', 'itm-bits', '2026-08-12'],
  ['itm-router', 'itm-printer', '2026-08-14'],
];

const fixtureEdges: readonly Edge[] = [
  ['itm-tv', 'fx-tv-outlet', '2026-08-03'],
  ['itm-soundbar', 'fx-tv-outlet', '2026-08-03'],
  ['itm-console', 'fx-tv-outlet', '2026-08-03'],
  ['itm-tv', 'fx-antenna', '2026-08-03'],
  ['itm-router', 'fx-study-port', '2026-08-04'],
  ['itm-router', 'fx-desk-outlet', '2026-08-04'],
  ['itm-lamp', 'fx-desk-outlet', '2026-08-05'],
  ['itm-printer', 'fx-desk-outlet', '2026-08-14'],
  ['itm-toaster', 'fx-bench-outlet', '2026-08-06'],
  ['itm-blender', 'fx-bench-outlet', '2026-08-06'],
  ['itm-drill', 'fx-workbench-outlet', '2026-08-12'],
];

/** Every connection in the house. */
export const houseConnections: readonly ConnectionModel[] = [
  ...itemEdges.map(([itemId, other, on], index) => ({
    id: `cx-i${index + 1}`,
    itemId,
    to: { kind: 'item' as const, itemId: other },
    createdAt: `${on}T09:00:00.000Z`,
  })),
  ...fixtureEdges.map(([itemId, fixtureId, on], index) => ({
    id: `cx-f${index + 1}`,
    itemId,
    to: { kind: 'fixture' as const, fixtureId },
    createdAt: `${on}T09:00:00.000Z`,
  })),
];
