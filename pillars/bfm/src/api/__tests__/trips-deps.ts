import { createPillarGateway } from '../pillars/gateway.js';
import { createMobileCaptureClient } from '../trips/capture.js';
import { createMobileTripsClient } from '../trips/client.js';

import type { BfmApiDeps } from '../app.js';
import type { PillarHandleFactory } from '../pillars/gateway.js';

type TripsDeps = Pick<BfmApiDeps, 'trips' | 'captures'>;
/** Defaults both Trips surfaces to the harness's refusal factory; tests must inject their owning client. */
export function tripsDeps(options: Partial<TripsDeps>, factory: PillarHandleFactory): TripsDeps {
  return {
    trips: options.trips ?? createMobileTripsClient(createPillarGateway(factory)),
    captures: options.captures ?? createMobileCaptureClient(createPillarGateway(factory)),
  };
}
