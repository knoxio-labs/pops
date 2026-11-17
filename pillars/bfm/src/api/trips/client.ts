import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { getTrip, getTripV3 } from './detail-reader.js';
import { referencedTripsPlaceIds, tripsContractMismatch } from './references.js';
import { readMobileTripRoute } from './route.js';
import { TripsWire } from './wire.js';
import { createMobileTrip, updateMobileTrip } from './write.js';

import type { MobileTripRoute } from '../../contract/mobile-trip-route-schemas.js';
import type { MobileTripInput } from '../../contract/mobile-trip-write-schemas.js';
import type {
  MobileTripDetailV2,
  MobileTripDetailV3,
} from '../../contract/mobile-trips-detail-schemas.js';
import type {
  MobileTripPlacePin,
  MobileTripPlaceV3,
  MobileTrip,
} from '../../contract/mobile-trips-schemas.js';

type TripsReadRouter = {
  trips: { list: () => Promise<unknown> };
  places: { update: (input: { id: number; pin: MobileTripPlacePin }) => Promise<unknown> };
};

/** Source-backed reads and explicit metadata writes; all persistence remains in Trips. */
export interface MobileTripsClient {
  createTrip(input: MobileTripInput): Promise<GatewayOutcome<MobileTrip>>;
  updateTrip(id: number, input: MobileTripInput): Promise<GatewayOutcome<MobileTrip>>;
  listTrips(): Promise<GatewayOutcome<MobileTrip[]>>;
  /** Assembles day-aware source once; each published handler selects its explicit wire projection. */
  getTrip(id: number): Promise<GatewayOutcome<MobileTripDetailV2>>;
  /** Reads the explicit-pin version; legacy detail operations retain their original wire shape. */
  getTripV3(id: number): Promise<GatewayOutcome<MobileTripDetailV3>>;
  /** Persists an explicit point only when the source place belongs to the requested trip. */
  updatePlacePin(
    tripId: number,
    placeId: number,
    pin: MobileTripPlacePin
  ): Promise<GatewayOutcome<MobileTripPlaceV3>>;
  /** Reads mixed membership at the route's own revision, retaining unavailable source identities. */
  getRoute(tripId: number): Promise<GatewayOutcome<MobileTripRoute>>;
}

/** Builds the source-backed native Trips reader over BFM's authenticated federation gateway. */
export function createMobileTripsClient(gateway: PillarGateway): MobileTripsClient {
  return {
    createTrip: (input) => createMobileTrip(gateway, input),
    updateTrip: (id, input) => updateMobileTrip(gateway, id, input),
    listTrips: async () => {
      const response = await gateway.call<TripsReadRouter, unknown>('trips', (handle) =>
        handle.trips.list()
      );
      const parsed = parseOrMismatch('trips', response, TripsWire.trips, 'trips.list');
      return isGatewayOk(parsed) ? { kind: 'ok', value: parsed.value.trips } : parsed;
    },
    getTrip: (id) => getTrip(gateway, id),
    getTripV3: (id) => getTripV3(gateway, id),
    updatePlacePin: (tripId, placeId, pin) => updatePlacePin(gateway, tripId, placeId, pin),
    getRoute: (tripId: number) => readMobileTripRoute(gateway, tripId),
  };
}

/** Resolves a source pin update through Trips after validating trip/place ownership. */
async function updatePlacePin(
  gateway: PillarGateway,
  tripId: number,
  placeId: number,
  pin: MobileTripPlacePin
): Promise<GatewayOutcome<MobileTripPlaceV3>> {
  const trip = await getTripV3(gateway, tripId);
  if (!isGatewayOk(trip)) return trip;
  if (!referencedTripsPlaceIds(trip.value).has(placeId)) {
    return { kind: 'not-found', pillar: 'trips', status: 404 };
  }
  const outcome = parseOrMismatch(
    'trips',
    await gateway.call<TripsReadRouter, unknown>('trips', (handle) =>
      handle.places.update({ id: placeId, pin })
    ),
    TripsWire.placeV3,
    'places.update'
  );
  return isGatewayOk(outcome) && outcome.value.id !== placeId
    ? tripsContractMismatch('Trips place update returned a different source identity')
    : outcome;
}
