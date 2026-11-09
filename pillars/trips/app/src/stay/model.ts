import type { Stay, StayPatch } from './types';

/** The complete editable source snapshot, excluding identities and audit metadata. */
export function staySource(stay: Stay): StayPatch {
  const {
    name,
    kind,
    status,
    visitId,
    timing,
    address,
    reference,
    notes,
    sourceLinks,
    hostLinks,
    documentLinks,
  } = stay;
  return {
    name,
    kind,
    status,
    visitId,
    timing,
    address,
    reference,
    notes,
    sourceLinks,
    hostLinks,
    documentLinks,
  };
}
/** Replace one optional timing member while retaining every other explicit member. */
export function changeTiming(
  timing: Stay['timing'],
  field: keyof Stay['timing'],
  value: string
): Stay['timing'] {
  const next = { ...timing };
  if (value === '') delete next[field];
  else next[field] = value;
  return next;
}
/** Checkout-exclusive calendar nights; incomplete or contradictory intervals stay unknown. */
export function calendarNights(timing: Stay['timing']): number | undefined {
  if (!timing.arrival || !timing.departure || timing.departure <= timing.arrival) return undefined;
  return (
    (Date.parse(`${timing.departure}T00:00:00Z`) - Date.parse(`${timing.arrival}T00:00:00Z`)) /
    86_400_000
  );
}
/** Neighbouring accommodation must share an explicit visit; unknown associations never imply coverage. */
export function neighbouringStays(stay: Stay, candidates: Stay[]): Stay[] {
  return stay.visitId === null
    ? []
    : candidates.filter(
        (candidate) => candidate.id !== stay.id && candidate.visitId === stay.visitId
      );
}
