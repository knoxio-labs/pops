import { unwrap } from '@pops/pillar-sdk/client';

import { eventsList, staysList, visitsList } from '../trips-api/sdk.gen';
import { zEventsListResponse, zStaysListResponse, zVisitsListResponse } from '../trips-api/zod.gen';

import type { TripEvent } from '../event/types';
import type { Visit, Stay } from '../stay/types';
import type { GapCaptureBinding } from './gap-capture-registry';

function current(binding: GapCaptureBinding): void {
  if (!binding.isCurrent()) throw new Error('The accommodation source connection changed');
}
/** Read only canonical Visit occurrences from the captured owner; foreign rows cannot prove an empty Visit. */
export async function accommodationVisits(binding: GapCaptureBinding): Promise<Visit[]> {
  current(binding);
  const result = await visitsList({
    client: binding.identity.client,
    path: { tripId: binding.identity.tripId },
  });
  const body = unwrap(result);
  current(binding);
  if (result.response?.status !== 200) throw new Error('Unconfirmed Visit collection');
  const { visits } = zVisitsListResponse.parse(body);
  if (visits.some((visit) => visit.tripId !== binding.identity.tripId))
    throw new Error('Foreign accommodation Visit');
  return visits;
}
/** Failed or foreign Stay collections remain unavailable, never fabricated empty coverage. */
export async function accommodationStays(binding: GapCaptureBinding): Promise<Stay[]> {
  current(binding);
  const result = await staysList({
    client: binding.identity.client,
    path: { tripId: binding.identity.tripId },
  });
  const body = unwrap(result);
  current(binding);
  if (result.response?.status !== 200) throw new Error('Unconfirmed Stay collection');
  const { stays } = zStaysListResponse.parse(body);
  if (stays.some((stay) => stay.tripId !== binding.identity.tripId))
    throw new Error('Foreign accommodation Stay');
  return stays;
}
/** Event dates supply existing projection boundaries only; they never become accommodation coverage. */
export async function accommodationEvents(binding: GapCaptureBinding): Promise<TripEvent[]> {
  current(binding);
  const result = await eventsList({
    client: binding.identity.client,
    path: { tripId: binding.identity.tripId },
  });
  const body = unwrap(result);
  current(binding);
  if (result.response?.status !== 200) throw new Error('Unconfirmed Event collection');
  const { events } = zEventsListResponse.parse(body);
  if (events.some((event) => event.tripId !== binding.identity.tripId))
    throw new Error('Foreign accommodation Event');
  return events;
}
