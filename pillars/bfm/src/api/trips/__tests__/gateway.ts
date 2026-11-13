import { z } from 'zod';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createPillarGateway } from '../../pillars/gateway.js';
import { createMobileTripsClient } from '../client.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { MobileTripDetailV2 } from '../../../contract/mobile-trips-detail-schemas.js';
import type { PillarHandleFactory } from '../../pillars/gateway.js';
import type { MobileTripsClient } from '../client.js';

/** A producer-route override can supply real SDK failure outcomes or malformed source bodies. */
export interface TripsResponses {
  trip?: CallResult<unknown>;
  trips?: CallResult<unknown>;
  places?: CallResult<unknown>;
  visits?: CallResult<unknown>;
  journeys?: CallResult<unknown>;
  groups?: CallResult<unknown>;
  stays?: CallResult<unknown>;
  events?: CallResult<unknown>;
  associations?: CallResult<unknown>;
  legs?: CallResult<unknown>;
}
function sourceLegs(
  detail: MobileTripDetailV2,
  input: unknown
): { legs: MobileTripDetailV2['journeys'][number]['legs'] } {
  const parsed = z.object({ tripId: z.number(), journeyId: z.number() }).parse(input);
  return { legs: detail.journeys.find((journey) => journey.id === parsed.journeyId)?.legs ?? [] };
}
function sourceJourneys(detail: MobileTripDetailV2): {
  journeys: Omit<MobileTripDetailV2['journeys'][number], 'legs'>[];
} {
  return { journeys: detail.journeys.map(({ legs: _legs, ...journey }) => journey) };
}
/** Drives the actual authenticated gateway/client mapping without a network or unsafe handle casts. */
export function tripsClientOver(
  detail: MobileTripDetailV2,
  responses: TripsResponses = {}
): { client: MobileTripsClient; calls: { operation: string; input: unknown }[] } {
  const calls: { operation: string; input: unknown }[] = [];
  function answer(
    operation: string,
    input: unknown,
    fallback: unknown,
    override?: CallResult<unknown>
  ): Promise<CallResult<unknown>> {
    calls.push({ operation, input });
    return Promise.resolve(override ?? { kind: 'ok' as const, value: fallback });
  }
  const factory: PillarHandleFactory = <TRouter>() =>
    fakePillarHandle<TRouter>('trips', {
      trips: {
        list: (input) => answer('trips.list', input, { trips: [detail.trip] }, responses.trips),
        get: (input) => answer('trips.get', input, detail.trip, responses.trip),
      },
      places: {
        list: (input) => answer('places.list', input, { places: detail.places }, responses.places),
      },
      visits: {
        list: (input) => answer('visits.list', input, { visits: detail.visits }, responses.visits),
      },
      journeys: {
        list: (input) => answer('journeys.list', input, sourceJourneys(detail), responses.journeys),
      },
      journeyGroups: {
        list: (input) =>
          answer('journeyGroups.list', input, { groups: detail.journeyGroups }, responses.groups),
      },
      documentAssociations: {
        list: (input) =>
          answer(
            'documentAssociations.list',
            input,
            { associations: detail.documentAssociations },
            responses.associations
          ),
      },
      events: {
        list: (input) => answer('events.list', input, { events: detail.events }, responses.events),
      },
      stays: {
        list: (input) => answer('stays.list', input, { stays: detail.stays }, responses.stays),
      },
      journeyLegs: {
        list: (input) =>
          answer('journeyLegs.list', input, sourceLegs(detail, input), responses.legs),
      },
    });
  return { client: createMobileTripsClient(createPillarGateway(factory)), calls };
}
