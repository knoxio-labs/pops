import type {
  Journey,
  JourneyLeg,
  JourneyPatch,
  LegPatch,
  JourneySource,
  JourneyChange,
} from './types';

/** Source edits, ordering and receipt-backed lifecycle writes retain exact retry intent; create remains ambiguous. */
export function canRetryJourneyChange(change: JourneyChange): boolean {
  return change.kind !== 'create';
}

/** Complete mutable metadata snapshot for persisted undo, excluding audit/identity. */
export function journeySource(journey: Journey): JourneyPatch {
  const { name, reference, notes, sourceLinks, buffers } = journey;
  return { name, reference, notes, sourceLinks, buffers };
}
/** Complete leg source snapshot; opaque endpoint/provenance members remain intact. */
export function legSource(leg: JourneyLeg): LegPatch {
  const {
    mode,
    from,
    to,
    intention,
    arrangement,
    purchase,
    operator,
    service,
    reference,
    notes,
    sourceLinks,
  } = leg;
  return {
    mode,
    from,
    to,
    intention,
    arrangement,
    purchase,
    operator,
    service,
    reference,
    notes,
    sourceLinks,
  };
}
/** Apply a draft edit without changing source identity or inventing server ordering. */
export function draftJourney(source: JourneySource, change: JourneyChange): JourneySource {
  if (change.kind === 'journey')
    return { ...source, journey: { ...source.journey, ...change.patch } };
  if (change.kind === 'leg')
    return {
      ...source,
      legs: source.legs.map((leg) => (leg.id === change.id ? { ...leg, ...change.patch } : leg)),
    };
  return source;
}
/** Source-only equality excludes audit timestamps refreshed by successful writes. */
export function sameJourney(a: JourneySource, b: JourneySource): boolean {
  const snapshot = (source: JourneySource): unknown[] => [
    journeySource(source.journey),
    source.legs.map((leg) => [leg.id, legSource(leg)]),
  ];
  return JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b));
}
/** Remove one optional endpoint member while retaining every other explicit source fact. */
export function endpointText(
  endpoint: JourneyLeg['from'],
  field: 'sourceLabel' | 'local' | 'timeZone',
  value: string
): JourneyLeg['from'] {
  const next = { ...endpoint };
  if (value === '') delete next[field];
  else next[field] = value;
  return next;
}
