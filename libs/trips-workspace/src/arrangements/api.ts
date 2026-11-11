import { unwrap } from '@pops/pillar-sdk/client';

import {
  eventsList,
  journeysList,
  journeyLegsList,
  rentalsList,
  rentalsGet,
  rentalsUpdate,
  responsibilitiesList,
  responsibilitiesGet,
  responsibilitiesReplace,
  staysCreate,
} from '../trips-api/sdk.gen';
import {
  zStaysCreateResponse,
  zRentalsGetResponse,
  zRentalsUpdateResponse,
  zResponsibilitiesGetResponse,
  zResponsibilitiesReplaceResponse,
} from '../trips-api/zod.gen';

import type { TripEvent } from '../event/types';
import type { Journey, JourneyLeg } from '../journey/types';
import type { Stay } from '../stay/types';
import type {
  ArrangementResponsibility,
  ArrangementTarget,
  ArrangementsWorkspaceProps,
  Rental,
  RentalPatch,
} from './types';

/** Transport-scoped source keys shared with canonical editors for trip, Visits and Stays. */
export function arrangementsKey(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>
): readonly ['trips', string, number] {
  return ['trips', props.client?.getConfig().baseUrl ?? '/trips-api', props.tripId] as const;
}
/** Complete independent event collection; list endpoints have no pagination contract. */
export async function loadEvents(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>
): Promise<TripEvent[]> {
  return unwrap(await eventsList({ client: props.client, path: { tripId: props.tripId } })).events;
}
/** Complete source journey identities; route placement is intentionally absent from this contract. */
export async function loadJourneys(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>
): Promise<Journey[]> {
  return unwrap(await journeysList({ client: props.client, path: { tripId: props.tripId } }))
    .journeys;
}
/** Read one Journey's actual ordered legs; endpoint locations never imply a Visit association. */
export async function loadLegs(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>,
  journeyId: number
): Promise<JourneyLeg[]> {
  return unwrap(
    await journeyLegsList({ client: props.client, path: { tripId: props.tripId, journeyId } })
  ).legs;
}
/** Complete source rental periods, each retaining its independent pickup and return identities. */
export async function loadRentals(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>
): Promise<Rental[]> {
  return unwrap(await rentalsList({ client: props.client, path: { tripId: props.tripId } }))
    .rentals;
}
/** Read the exact canonical rental and its current revision before source editing or explicit reload. */
export async function loadRental(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>,
  id: number
): Promise<Rental> {
  const result = await rentalsGet({ client: props.client, path: { tripId: props.tripId, id } });
  const source = unwrap(result);
  if (result.response?.status !== 200) throw new Error('Unexpected Rental read status');
  const parsed = zRentalsGetResponse.parse(source);
  if (parsed.id !== id || parsed.tripId !== props.tripId)
    throw new Error('Rental source does not match its target');
  return parsed;
}
/** Read explicit assignments; an absent row is an untouched target, never an inferred owner. */
export async function loadResponsibilities(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>
): Promise<ArrangementResponsibility[]> {
  return unwrap(
    await responsibilitiesList({ client: props.client, path: { tripId: props.tripId } })
  ).responsibilities;
}
/** Read the target's authoritative revision before offering responsibility writes. */
export async function loadResponsibility(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>,
  target: ArrangementTarget
): Promise<ArrangementResponsibility> {
  const result = await responsibilitiesGet({
    client: props.client,
    path: { tripId: props.tripId, ...target },
  });
  const source = unwrap(result);
  if (result.response?.status !== 200) throw new Error('Unexpected responsibility read status');
  return zResponsibilitiesGetResponse.parse(source);
}
/** Replace only responsibility, pinned to the confirmed assignment revision and exact target identity. */
export async function replaceResponsibility(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>,
  source: ArrangementResponsibility,
  responsibility: ArrangementResponsibility['responsibility']
): Promise<ArrangementResponsibility> {
  const result = await responsibilitiesReplace({
    client: props.client,
    path: { tripId: props.tripId, targetKind: source.targetKind, targetId: source.targetId },
    body: { expectedRevision: source.revision, responsibility },
  });
  const receipt = unwrap(result);
  if (result.response?.status !== 200) throw new Error('Unconfirmed responsibility write status');
  return zResponsibilitiesReplaceResponse.parse(receipt);
}
/** Explicit partial rental write; retries retain the same optimistic precondition. */
export async function patchRental(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>,
  id: number,
  body: RentalPatch
): Promise<Rental> {
  const result = await rentalsUpdate({
    client: props.client,
    path: { tripId: props.tripId, id },
    body,
  });
  const receipt = unwrap(result);
  if (result.response?.status !== 200) throw new Error('Unconfirmed Rental write status');
  return zRentalsUpdateResponse.parse(receipt);
}
/** Capture a real Stay for the explicitly selected uncovered interval, then open its canonical editor. */
export async function createGapStay(
  props: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>,
  visitId: number,
  arrival: string,
  departure: string
): Promise<Stay> {
  const result = await staysCreate({
    client: props.client,
    path: { tripId: props.tripId },
    body: { visitId, timing: { arrival, departure } },
  });
  const receipt = unwrap(result);
  if (result.response?.status !== 201) throw new Error('Unconfirmed Stay creation status');
  const source = zStaysCreateResponse.parse(receipt);
  if (source.tripId !== props.tripId || source.visitId !== visitId)
    throw new Error('Stay creation does not match its explicit target');
  return source;
}
