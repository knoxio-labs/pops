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
    from: endpointInput(from),
    to: endpointInput(to),
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
  if (change.kind === 'leg') {
    const { from, to, ...fields } = change.patch;
    return {
      ...source,
      legs: source.legs.map((leg) =>
        leg.id === change.id
          ? {
              ...leg,
              ...fields,
              ...(from === undefined ? {} : { from: draftEndpoint(leg.from, from) }),
              ...(to === undefined ? {} : { to: draftEndpoint(leg.to, to) }),
            }
          : leg
      ),
    };
  }
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
/** Complete endpoint snapshots explicitly clear absent day precision, including persisted Undo. */
export function endpointInput(endpoint: JourneyLeg['from']): NonNullable<LegPatch['from']> {
  return { ...endpoint, date: endpoint.date ?? null };
}

function draftEndpoint(
  previous: JourneyLeg['from'],
  input: NonNullable<LegPatch['from']>
): JourneyLeg['from'] {
  const { date, ...fields } = input;
  if (fields.local !== undefined || date === null) return fields;
  const retainedDay = date ?? previous.date;
  return { ...fields, ...(retainedDay === undefined ? {} : { date: retainedDay }) };
}

/** Edit source precision explicitly: clearing a clock retains its day; clearing the day removes both. */
export function endpointText(
  endpoint: JourneyLeg['from'],
  field: 'sourceLabel' | 'date' | 'local' | 'timeZone',
  value: string
): JourneyLeg['from'] {
  const next = { ...endpoint };
  if (field === 'date') {
    if (value === '') {
      delete next.date;
      delete next.local;
    } else if (next.local !== undefined) {
      next.local = `${value}T${next.local.split('T')[1] ?? ''}`;
      delete next.date;
    } else next.date = value;
    return next;
  }
  if (field === 'local') {
    if (value === '') {
      if (next.local !== undefined) next.date = next.local.split('T')[0] ?? next.local;
      delete next.local;
    } else {
      next.local = value;
      delete next.date;
    }
    return next;
  }
  if (value === '') delete next[field];
  else next[field] = value;
  return next;
}
