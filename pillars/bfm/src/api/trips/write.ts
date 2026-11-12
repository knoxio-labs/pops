import { MobileTripSchema } from '../../contract/mobile-trips-schemas.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { tripsContractMismatch } from './references.js';

import type { MobileTripInput } from '../../contract/mobile-trip-write-schemas.js';
import type { MobileTrip } from '../../contract/mobile-trips-schemas.js';
import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';

type Router = {
  trips: {
    create(input: MobileTripInput): Promise<unknown>;
    update(input: MobileTripInput & { id: number }): Promise<unknown>;
  };
};
/** Forwards one permanent canonical creation without inventing retry identity or automatically replaying. */
export async function createMobileTrip(
  gateway: PillarGateway,
  input: MobileTripInput
): Promise<GatewayOutcome<MobileTrip>> {
  return parseOrMismatch(
    'trips',
    await gateway.call<Router, unknown>('trips', (h) => h.trips.create(input)),
    MobileTripSchema,
    'trips.create'
  );
}
/** Patches only explicit source metadata and refuses an outcome for a different Trip identity. */
export async function updateMobileTrip(
  gateway: PillarGateway,
  id: number,
  input: MobileTripInput
): Promise<GatewayOutcome<MobileTrip>> {
  const outcome = parseOrMismatch(
    'trips',
    await gateway.call<Router, unknown>('trips', (h) => h.trips.update({ id, ...input })),
    MobileTripSchema,
    'trips.update'
  );
  return isGatewayOk(outcome) && outcome.value.id !== id
    ? tripsContractMismatch('Trips update returned a different source identity')
    : outcome;
}
