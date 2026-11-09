import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

/** Stable registry identity of the trips pillar. */
export const TRIPS_PILLAR_ID = 'trips' as const;

/** Publish the trips foundation's source operations without declaring a frontend application. */
export function buildTripsManifest(version: string): ManifestPayload {
  return {
    pillar: TRIPS_PILLAR_ID,
    version,
    contract: { package: '@pops/trips', version, tag: `contract-trips@v${version}` },
    routes: {
      queries: [
        'trips.stays.list',
        'trips.stays.get',
        'trips.journeyGroups.list',
        'trips.journeyGroups.get',
        'trips.journeys.list',
        'trips.journeys.get',
        'trips.journeys.timing',
        'trips.journeyLegs.list',
        'trips.journeyLegs.get',
        'trips.trips.list',
        'trips.trips.get',
        'trips.places.list',
        'trips.places.get',
        'trips.visits.list',
        'trips.visits.get',
      ],
      mutations: [
        'trips.stays.create',
        'trips.stays.update',
        'trips.stays.delete',
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
        'trips.journeyLegs.reorder',
        'trips.trips.create',
        'trips.trips.update',
        'trips.places.create',
        'trips.places.update',
        'trips.visits.create',
        'trips.visits.update',
        'trips.visits.reorder',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
