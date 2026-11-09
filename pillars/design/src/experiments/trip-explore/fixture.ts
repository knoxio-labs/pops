import { initialEventWorkspace } from '../trip-event-detail/fixture';
import { initialIdea } from '../trip-place-detail/fixture';
import { initialCapture } from '../trip-quick-capture/fixture';

import type { TripPlace } from '../../fixtures/trip-places';
import type { ExploreRecord, ExploreScenario, ExploreState } from './model';

/** Named collection review scenarios. */
export type { ExploreScenario } from './model';

/** Builds independent source-backed fictional ideas, venues, events and verbatim social captures. */
export function createExploreState(scenario: ExploreScenario = 'default'): ExploreState {
  const sourceScenario = scenario === 'missing-reference' ? 'missing-reference' : 'default';
  const event = initialEventWorkspace(sourceScenario);
  const record = event.canvas.records.find((entry) => entry.id === event.eventId);
  if (!record) throw new Error('Missing approved event fixture');
  const idea = initialIdea(sourceScenario);
  const destination = {
    ...initialIdea('empty'),
    name: 'Olinda',
    kind: 'destination' as const,
    purpose: 'visit' as const,
    cityId: 'olinda',
  };
  const venue = event.references.find((reference) => reference.kind === 'venue');
  if (!venue) throw new Error('Missing approved venue fixture');
  const place = { ...initialIdea('empty'), name: venue.name, address: venue.address ?? '' };
  const locations: TripPlace[] = [
    ...idea.cities.map((city) => ({ ...city, kind: 'city' as const })),
    ...event.canvas.places.filter((entry) => !idea.cities.some((city) => city.id === entry.id)),
  ];
  const records: ExploreRecord[] = [
    { id: 'idea-drawing', source: 'idea', idea },
    { id: 'idea-olinda', source: 'idea', idea: destination },
    { id: 'idea-venue', source: 'idea', idea: place },
    {
      id: 'event-festival',
      source: 'event',
      event: record,
      metadata: event.metadata,
      references: event.references,
      places: event.canvas.places,
    },
    ...initialCapture('default').items.map((capture): ExploreRecord => ({
      id: capture.id,
      source: 'capture',
      capture,
      cityId: '',
      status: '',
      purpose: '',
      notes: '',
      cities: locations.map((location) => ({ ...location })),
      timing: { mode: 'none', month: '', from: '', to: '' },
    })),
  ];
  if (scenario === 'empty') return { records: [], cities: locations };
  if (scenario === 'undated') {
    for (const entry of records) {
      if (entry.source === 'idea')
        entry.idea.timing = { mode: 'none', month: '', from: '', to: '' };
      if (entry.source === 'event') entry.event = { ...entry.event, schedule: undefined };
    }
  }
  return { records, cities: locations };
}
