import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import {
  referencedTripsPlaceIds,
  tripsContractMismatch,
  validTripsReferences,
} from './references.js';
import { TripsWire } from './wire.js';

import type { z } from 'zod';

import type {
  MobileTripDetailV2,
  MobileTripDetailV3,
} from '../../contract/mobile-trips-detail-schemas.js';
import type { MobileJourney } from '../../contract/mobile-trips-journey-schemas.js';

type TripsReadRouter = {
  trips: { get: (input: { id: number }) => Promise<unknown> };
  places: { list: () => Promise<unknown> };
  visits: { list: (input: { tripId: number }) => Promise<unknown> };
  journeys: { list: (input: { tripId: number }) => Promise<unknown> };
  journeyGroups: { list: (input: { tripId: number }) => Promise<unknown> };
  stays: { list: (input: { tripId: number }) => Promise<unknown> };
  events: { list: (input: { tripId: number }) => Promise<unknown> };
  documentAssociations: { list: (input: { tripId: number }) => Promise<unknown> };
  journeyLegs: {
    list: (input: { tripId: number; journeyId: number }) => Promise<unknown>;
  };
};

type TripsCollections<TPlace extends MobileTripDetailV2['places'][number]> = {
  places: GatewayOutcome<{ places: TPlace[] }>;
  visits: GatewayOutcome<z.infer<typeof TripsWire.visits>>;
  journeys: GatewayOutcome<z.infer<typeof TripsWire.journeys>>;
  groups: GatewayOutcome<z.infer<typeof TripsWire.groups>>;
  stays: GatewayOutcome<z.infer<typeof TripsWire.stays>>;
  events: GatewayOutcome<z.infer<typeof TripsWire.events>>;
  associations: GatewayOutcome<z.infer<typeof TripsWire.associations>>;
};
function parseCollection<T>(
  response: GatewayOutcome<unknown>,
  schema: z.ZodType<T>,
  operation: string
): GatewayOutcome<T> {
  if (response.kind === 'not-found') {
    return { ...response, kind: 'contract-mismatch', status: 502, upstreamStatus: 404 };
  }
  return parseOrMismatch('trips', response, schema, operation);
}
async function readCollections<TPlace extends MobileTripDetailV2['places'][number]>(
  gateway: PillarGateway,
  tripId: number,
  placesSchema: z.ZodType<{ places: TPlace[] }>
): Promise<TripsCollections<TPlace>> {
  const [places, visits, journeys, groups, stays, events, associations] = await Promise.all([
    gateway.call<TripsReadRouter, unknown>('trips', (h) => h.places.list()),
    gateway.call<TripsReadRouter, unknown>('trips', (h) => h.visits.list({ tripId })),
    gateway.call<TripsReadRouter, unknown>('trips', (h) => h.journeys.list({ tripId })),
    gateway.call<TripsReadRouter, unknown>('trips', (h) => h.journeyGroups.list({ tripId })),
    gateway.call<TripsReadRouter, unknown>('trips', (h) => h.stays.list({ tripId })),
    gateway.call<TripsReadRouter, unknown>('trips', (h) => h.events.list({ tripId })),
    gateway.call<TripsReadRouter, unknown>('trips', (h) => h.documentAssociations.list({ tripId })),
  ]);
  return {
    places: parseCollection(places, placesSchema, 'places.list'),
    visits: parseCollection(visits, TripsWire.visits, 'visits.list'),
    journeys: parseCollection(journeys, TripsWire.journeys, 'journeys.list'),
    groups: parseCollection(groups, TripsWire.groups, 'journeyGroups.list'),
    stays: parseCollection(stays, TripsWire.stays, 'stays.list'),
    events: parseCollection(events, TripsWire.events, 'events.list'),
    associations: parseCollection(
      associations,
      TripsWire.associations,
      'documentAssociations.list'
    ),
  };
}

type TripCollections<TPlace extends MobileTripDetailV2['places'][number]> = {
  places: { places: TPlace[] };
  visits: z.infer<typeof TripsWire.visits>;
  journeys: z.infer<typeof TripsWire.journeys>;
  groups: z.infer<typeof TripsWire.groups>;
  stays: z.infer<typeof TripsWire.stays>;
  events: z.infer<typeof TripsWire.events>;
  associations: z.infer<typeof TripsWire.associations>;
};

type TripDetail<TPlace extends MobileTripDetailV2['places'][number]> = Omit<
  MobileTripDetailV2,
  'places'
> & {
  places: TPlace[];
};

function checkedCollections<TPlace extends MobileTripDetailV2['places'][number]>(
  reads: TripsCollections<TPlace>
): GatewayOutcome<TripCollections<TPlace>> {
  if (!isGatewayOk(reads.places)) return reads.places;
  if (!isGatewayOk(reads.visits)) return reads.visits;
  if (!isGatewayOk(reads.journeys)) return reads.journeys;
  if (!isGatewayOk(reads.groups)) return reads.groups;
  if (!isGatewayOk(reads.stays)) return reads.stays;
  if (!isGatewayOk(reads.events)) return reads.events;
  if (!isGatewayOk(reads.associations)) return reads.associations;
  return {
    kind: 'ok',
    value: {
      places: reads.places.value,
      visits: reads.visits.value,
      journeys: reads.journeys.value,
      groups: reads.groups.value,
      stays: reads.stays.value,
      events: reads.events.value,
      associations: reads.associations.value,
    },
  };
}

async function readJourney(
  gateway: PillarGateway,
  tripId: number,
  journey: MobileJourney
): Promise<GatewayOutcome<MobileTripDetailV2['journeys'][number]>> {
  const response = await gateway.call<TripsReadRouter, unknown>('trips', (h) =>
    h.journeyLegs.list({ tripId, journeyId: journey.id })
  );
  const legs = parseCollection(response, TripsWire.legs, 'journeyLegs.list');
  return isGatewayOk(legs)
    ? { kind: 'ok' as const, value: { ...journey, legs: legs.value.legs } }
    : legs;
}

/** Reads one trip and validates its referenced records against the requested trip identity. */
export async function getTrip(
  gateway: PillarGateway,
  id: number
): Promise<GatewayOutcome<MobileTripDetailV2>> {
  return readTrip(gateway, id, TripsWire.places);
}

async function readTrip<TPlace extends MobileTripDetailV2['places'][number]>(
  gateway: PillarGateway,
  id: number,
  placesSchema: z.ZodType<{ places: TPlace[] }>
): Promise<GatewayOutcome<TripDetail<TPlace>>> {
  const response = await gateway.call<TripsReadRouter, unknown>('trips', (h) =>
    h.trips.get({ id })
  );
  const trip = parseOrMismatch('trips', response, TripsWire.trip, 'trips.get');
  if (!isGatewayOk(trip)) return trip;
  if (trip.value.id !== id)
    return tripsContractMismatch('Trips get returned a different source identity');
  const collectionRead = checkedCollections(await readCollections(gateway, id, placesSchema));
  if (!isGatewayOk(collectionRead)) return collectionRead;
  const reads = collectionRead.value;
  const journeys: MobileTripDetailV2['journeys'] = [];
  for (const journey of reads.journeys.journeys) {
    const detailed = await readJourney(gateway, id, journey);
    if (!isGatewayOk(detailed)) return detailed;
    journeys.push(detailed.value);
  }
  const detail: TripDetail<TPlace> = {
    trip: trip.value,
    places: reads.places.places,
    visits: reads.visits.visits,
    journeys,
    journeyGroups: reads.groups.groups,
    stays: reads.stays.stays,
    events: reads.events.events,
    documentAssociations: reads.associations.associations,
  };
  if (!validTripsReferences(detail, id))
    return tripsContractMismatch('Trips read contained inconsistent source references');
  const referenced = referencedTripsPlaceIds(detail);
  return {
    kind: 'ok',
    value: { ...detail, places: detail.places.filter((place) => referenced.has(place.id)) },
  };
}

/** Reads validated detail with the pin-aware place projection used by mobile map edits. */
export async function getTripV3(
  gateway: PillarGateway,
  id: number
): Promise<GatewayOutcome<MobileTripDetailV3>> {
  return readTrip(gateway, id, TripsWire.placesV3);
}
