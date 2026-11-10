import { TRIPS_NAV } from '../contract/nav.js';
import { TRIPS_PAGES } from '../contract/pages.js';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

const TRIPS_WIRE_NAV = { ...TRIPS_NAV, items: [...TRIPS_NAV.items] } satisfies NavConfigDescriptor;
const TRIPS_WIRE_PAGES = [...TRIPS_PAGES] satisfies PageDescriptor[];
const TRIPS_QUERIES = [
  'trips.rentals.list',
  'trips.rentals.get',
  'trips.responsibilities.list',
  'trips.responsibilities.get',
  'trips.events.list',
  'trips.events.get',
  'trips.decisions.list',
  'trips.decisions.get',
  'trips.decisions.workspace',
  'trips.decisionOptions.list',
  'trips.decisionOptions.get',
  'trips.stays.list',
  'trips.stays.get',
  'trips.documentAssociations.list',
  'trips.journeyGroups.list',
  'trips.journeyGroups.get',
  'trips.journeys.list',
  'trips.journeys.get',
  'trips.journeys.timing',
  'trips.journeys.workspace',
  'trips.journeyLegs.list',
  'trips.journeyLegs.get',
  'trips.trips.list',
  'trips.trips.get',
  'trips.places.list',
  'trips.places.get',
  'trips.visits.list',
  'trips.visits.get',
] as const;
const TRIPS_MUTATIONS = [
  'trips.rentals.create',
  'trips.rentals.update',
  'trips.rentals.delete',
  'trips.responsibilities.replace',
  'trips.events.create',
  'trips.events.update',
  'trips.events.delete',
  'trips.decisions.create',
  'trips.decisions.update',
  'trips.decisions.select',
  'trips.decisions.delete',
  'trips.decisionOptions.create',
  'trips.decisionOptions.update',
  'trips.decisionOptions.delete',
  'trips.decisionOptions.restore',
  'trips.stays.create',
  'trips.stays.update',
  'trips.stays.delete',
  'trips.documentAssociations.create',
  'trips.documentAssociations.delete',
  'trips.journeyGroups.create',
  'trips.journeyGroups.addBlank',
  'trips.journeyGroups.select',
  'trips.journeyGroups.delete',
  'trips.journeys.create',
  'trips.journeys.update',
  'trips.journeys.delete',
  'trips.journeyLegs.create',
  'trips.journeyLegs.update',
  'trips.journeyLegs.delete',
  'trips.journeyLegs.remove',
  'trips.journeyLegs.restore',
  'trips.journeyLegs.reorder',
  'trips.trips.create',
  'trips.trips.update',
  'trips.places.create',
  'trips.places.update',
  'trips.visits.create',
  'trips.visits.update',
  'trips.visits.reorder',
];

/** Stable registry identity of the trips pillar. */
export const TRIPS_PILLAR_ID = 'trips' as const;

/** Publish Trips source operations and its source-backed shell routes. */
export function buildTripsManifest(version: string): ManifestPayload {
  return {
    pillar: TRIPS_PILLAR_ID,
    version,
    contract: { package: '@pops/trips', version, tag: `contract-trips@v${version}` },
    routes: {
      queries: [...TRIPS_QUERIES],
      mutations: [...TRIPS_MUTATIONS],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    nav: TRIPS_WIRE_NAV,
    pages: [...TRIPS_WIRE_PAGES],
    assetsBaseUrl: '/trips-ui/trips.js',
    stylesheetUrl: '/trips-ui/trips.css',
    healthcheck: { path: '/health' },
  };
}
