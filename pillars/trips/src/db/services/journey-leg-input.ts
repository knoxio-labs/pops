import {
  JourneyEndpointInputSchema,
  JourneyEndpointSchema,
} from '../../contract/journey-schemas.js';
import { getPlace } from './records.js';

import type { JourneyEndpoint, JourneyEndpointInput } from '../../contract/journey-schemas.js';
import type { TripsDb } from '../index.js';

/** Verify an explicitly supplied local place reference before persistence. */
export function checkJourneyLegEndpoint(
  db: TripsDb,
  endpoint: Pick<JourneyEndpoint, 'placeId'> | undefined
): void {
  if (endpoint?.placeId !== undefined) getPlace(db, endpoint.placeId);
}

/** Apply a precise endpoint input while retaining an omitted previous day-only value. */
export function resolvedJourneyEndpoint(
  previous: JourneyEndpoint,
  input: JourneyEndpointInput
): JourneyEndpoint {
  const { date, ...fields } = JourneyEndpointInputSchema.parse(input);
  if (fields.local !== undefined || date === null) return JourneyEndpointSchema.parse(fields);
  const retainedDay = date ?? previous.date;
  return JourneyEndpointSchema.parse({
    ...fields,
    ...(retainedDay === undefined ? {} : { date: retainedDay }),
  });
}
