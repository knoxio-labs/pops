import { normalizeSearchText } from '../../fixtures/search-text';
import { initialIdea } from '../trip-place-detail/fixture';
import { ideaFindings, ideaTimingLabel } from '../trip-place-detail/model';
import { captureLabel } from '../trip-quick-capture/model';

import type { ExploreRecord, ExploreState, ExploreDraft, ExploreFilters } from './types';

function sourceLocation(record: ExploreRecord) {
  if (record.source === 'idea')
    return {
      id: record.idea.cityId,
      location: record.idea.cities.find((city) => city.id === record.idea.cityId),
      kind: 'city',
    };
  if (record.source === 'event') {
    const location = record.places.find((place) => place.id === record.event.placeId);
    return { id: record.event.placeId, location, kind: location?.kind ?? '' };
  }
  const location = record.cities.find((place) => place.id === record.cityId);
  return { id: record.cityId, location, kind: location?.kind ?? '' };
}

function eventTiming(record: Extract<ExploreRecord, { source: 'event' }>) {
  return {
    ...initialIdea('empty'),
    timing: {
      mode: 'dates' as const,
      month: '',
      from: record.event.schedule?.start ?? '',
      to: record.event.schedule?.end ?? '',
    },
  };
}

function projectedLocation(record: ExploreRecord, state?: ExploreState) {
  const source = sourceLocation(record);
  const location =
    record.source === 'capture'
      ? (state?.cities ?? record.cities).find((city) => city.id === source.id)
      : source.location;
  return {
    cityId: source.id,
    city: location?.name ?? (source.id ? 'Location unavailable' : 'No location'),
    locationKind: source.kind,
  };
}

/** Projects source facts without converting a region or airport into a city or discarding its identity. */
export function exploreFacts(record: ExploreRecord, state?: ExploreState) {
  const locationFacts = projectedLocation(record, state);
  if (record.source === 'idea')
    return {
      name: record.idea.name,
      kind: record.idea.kind,
      ...locationFacts,
      status: record.idea.status,
      purpose: record.idea.purpose,
      notes: record.idea.notes,
      timing: ideaTimingLabel(record.idea),
    };
  if (record.source === 'event')
    return {
      name: record.event.title ?? '',
      kind: 'event',
      ...locationFacts,
      status: record.event.intention,
      purpose: '',
      notes: record.event.notes,
      timing: ideaTimingLabel(eventTiming(record)),
    };
  return {
    name: captureLabel(record.capture),
    kind: record.kind ?? record.capture.kind ?? '',
    ...locationFacts,
    status: record.status,
    purpose: record.purpose,
    notes: record.notes,
    timing:
      record.timing.mode === 'none'
        ? ''
        : [record.timing.month, record.timing.from, record.timing.to].filter(Boolean).join(' – '),
  };
}

/** Copies editable fields without changing source material or borrowing route dates. */
export function exploreDraft(record: ExploreRecord): ExploreDraft {
  const facts = exploreFacts(record);
  if (record.source === 'capture') return { ...facts, timing: { ...record.timing } };
  return {
    ...facts,
    timing:
      record.source === 'idea'
        ? { ...record.idea.timing }
        : {
            mode: record.event.schedule ? 'dates' : 'none',
            month: '',
            from: record.event.schedule?.start ?? '',
            to: record.event.schedule?.end ?? '',
          },
  };
}

function linkedSearchFacts(record: ExploreRecord): string[] {
  if (record.source === 'capture')
    return [
      record.capture.text,
      record.capture.url,
      ...record.capture.files.map((file) => file.name),
    ];
  if (record.source === 'idea')
    return [
      record.idea.reason,
      record.idea.address,
      ...record.idea.links.flatMap((link) => [link.label, link.url]),
      ...record.idea.recommendations.flatMap((entry) => [
        entry.note,
        record.idea.contacts.find((contact) => contact.id === entry.contactId)?.name ?? '',
      ]),
    ];
  const selected = new Set([
    record.metadata.venueId,
    record.metadata.organiserId,
    ...record.metadata.documentIds,
  ]);
  return record.references.flatMap((reference) =>
    selected.has(reference.id) ? [reference.name, reference.address ?? '', reference.url ?? ''] : []
  );
}

/** Searches only source material and explicitly linked references while ANDing independent source filters. */
export function visibleExploreRecords(
  state: ExploreState,
  filters: ExploreFilters
): ExploreRecord[] {
  const query = normalizeSearchText(filters.query.trim());
  const fields: (keyof Omit<ExploreFilters, 'query'>)[] = ['kind', 'cityId', 'status', 'purpose'];
  return state.records.filter((record) => {
    const facts = exploreFacts(record, state);
    if (fields.some((key) => filters[key] && filters[key] !== facts[key])) return false;
    const location = facts.cityId && facts.city !== 'Location unavailable' ? facts.city : '';
    return [
      facts.name,
      location,
      facts.status,
      facts.purpose,
      facts.notes,
      facts.timing,
      ...linkedSearchFacts(record),
    ].some((value) => normalizeSearchText(value).includes(query));
  });
}

/** Groups the same records by exact source location, separating absent selections from unavailable identities. */
export function groupExploreRecords(
  records: ExploreRecord[],
  state?: ExploreState
): { id: string; name: string; records: ExploreRecord[] }[] {
  const groups = new Map<string, { id: string; name: string; records: ExploreRecord[] }>();
  for (const record of records) {
    const facts = exploreFacts(record, state);
    const group = groups.get(facts.cityId) ?? { id: facts.cityId, name: facts.city, records: [] };
    group.records.push(record);
    groups.set(facts.cityId, group);
  }
  return [...groups.values()];
}

/** Reports selected references that cannot be resolved; unselected catalogues impose no dependency. */
export function exploreFindings(
  record: ExploreRecord,
  state?: ExploreState
): { id: string; message: string }[] {
  if (record.source === 'idea')
    return ideaFindings(record.idea).map((finding) => ({
      id: finding.id,
      message: finding.detail,
    }));
  const findings: { id: string; message: string }[] = [];
  const facts = exploreFacts(record, state);
  if (facts.cityId && facts.city === 'Location unavailable')
    findings.push({ id: 'missing-city', message: 'The selected location is unavailable.' });
  if (record.source === 'event') {
    findings.push(
      ...ideaFindings(eventTiming(record)).map((finding) => ({
        id: finding.id,
        message: finding.detail,
      }))
    );
    for (const id of [
      record.metadata.venueId,
      record.metadata.organiserId,
      ...record.metadata.documentIds,
    ]) {
      if (id && !record.references.some((reference) => reference.id === id))
        findings.push({ id, message: 'A selected event reference is unavailable.' });
    }
  }
  return findings;
}
