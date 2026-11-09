import { ideaKinds, ideaStatuses, initialIdea } from '../trip-place-detail/fixture';
import { ideaFindings } from '../trip-place-detail/model';
import { captureItem, captureKinds } from '../trip-quick-capture/model';
import { exploreFacts } from './projection';

import type { TripRecord } from '../../fixtures/trip-overview-model';
import type { ExploreRecord, ExploreState, ExploreDraft } from './types';

export type {
  ExploreRecord,
  ExploreState,
  ExploreDraft,
  ExploreFilters,
  ExploreScenario,
} from './types';
export {
  exploreFacts,
  exploreDraft,
  exploreFindings,
  visibleExploreRecords,
  groupExploreRecords,
} from './projection';

/** Source status vocabulary for explicit classification; unclassified captures have no inferred status. */
export function exploreStatuses(kind: string): string[] {
  const intentions: TripRecord['intention'][] = ['In plan', 'Considering', 'Alternative'];
  if (kind === 'event') return intentions;
  return ideaKinds.some((choice) => choice.value === kind)
    ? ideaStatuses.map((status) => status.value)
    : [];
}

/** Creates a text-first draft with every optional classification and timing field unset. */
export function emptyExploreDraft(kind = ''): ExploreDraft {
  return {
    name: '',
    kind,
    cityId: '',
    status: '',
    purpose: '',
    notes: '',
    timing: { mode: 'none', month: '', from: '', to: '' },
  };
}

function locationError(
  state: ExploreState,
  cityId: string,
  existing?: ExploreRecord
): string | null {
  return cityId &&
    cityId !== (existing && exploreFacts(existing).cityId) &&
    !state.cities.some(
      (city) => city.id === cityId && (existing?.source !== 'idea' || city.kind === 'city')
    )
    ? 'Choose an available location or clear the selection.'
    : null;
}

function captureError(state: ExploreState, draft: ExploreDraft, id: string): string | null {
  if (!draft.name.trim()) return 'Enter some source text.';
  if (!id.trim() || state.records.some((record) => record.id === id))
    return 'Choose a distinct record identifier.';
  const kind = ideaKinds.find((choice) => choice.value === draft.kind)?.value;
  const sourceKind = captureKinds.find((choice) => choice.id === draft.kind)?.id;
  if (draft.kind && !kind && !sourceKind) return 'Choose an available kind or leave it unset.';
  const error = locationError(state, draft.cityId);
  if (error) return error;
  if (ideaFindings({ ...initialIdea('empty'), timing: draft.timing }).length)
    return 'Review the captured timing.';
  return null;
}

/** Captures verbatim text with optional explicit organisation and no route, purchase or inferred purpose. */
export function captureExploreRecord(
  state: ExploreState,
  draft: ExploreDraft,
  id: string
): { state: ExploreState; error: string | null } {
  const error = captureError(state, draft, id);
  if (error) return { state, error };
  const kind = ideaKinds.find((choice) => choice.value === draft.kind)?.value;
  const sourceKind = captureKinds.find((choice) => choice.id === draft.kind)?.id;
  const capture = captureItem(
    {
      draft: {
        text: draft.name,
        visitId: '',
        url: '',
        files: [],
        ...(sourceKind ? { kind: sourceKind } : {}),
      },
      items: [],
    },
    id
  ).items[0];
  if (!capture) return { state, error: 'Enter some source text.' };
  const record: ExploreRecord = {
    id,
    source: 'capture',
    capture,
    cityId: draft.cityId,
    status: draft.status,
    purpose: draft.purpose,
    notes: draft.notes,
    cities: state.cities.map((city) => ({ ...city })),
    timing: { ...draft.timing },
    ...(kind ? { kind } : {}),
  };
  return { state: { ...state, records: [...state.records, record] }, error: null };
}

function ideaCities(
  state: ExploreState,
  record: Extract<ExploreRecord, { source: 'idea' }>,
  cityId: string
) {
  if (
    !cityId ||
    cityId === record.idea.cityId ||
    record.idea.cities.some((city) => city.id === cityId)
  )
    return record.idea.cities;
  const selected = state.cities.find((city) => city.id === cityId && city.kind === 'city');
  return selected
    ? [...record.idea.cities, { id: selected.id, name: selected.name }]
    : record.idea.cities;
}

/** Edits selected local fields while retaining original material, external metadata, route and purchase facts. */
export function updateExploreRecord(
  state: ExploreState,
  id: string,
  input: Pick<ExploreDraft, 'name' | 'cityId' | 'status' | 'notes'>
): { state: ExploreState; error: string | null } {
  const record = state.records.find((entry) => entry.id === id);
  if (!record) return { state, error: 'This record is unavailable.' };
  if (!input.name.trim()) return { state, error: 'Enter a name.' };
  const error = locationError(state, input.cityId, record);
  if (error) return { state, error };
  let updated: ExploreRecord;
  if (record.source === 'capture')
    updated = {
      ...record,
      cityId: input.cityId,
      status: input.status,
      notes: input.notes,
      cities: state.cities.map((city) => ({ ...city })),
      capture: { ...record.capture, title: input.name },
    };
  else if (record.source === 'idea') {
    const status = ideaStatuses.find((choice) => choice.value === input.status)?.value;
    if (!status) return { state, error: 'Choose an available status.' };
    updated = {
      ...record,
      idea: {
        ...record.idea,
        ...input,
        status,
        cities: ideaCities(state, record, input.cityId),
      },
    };
  } else {
    const intention = input.status;
    if (intention !== 'In plan' && intention !== 'Considering' && intention !== 'Alternative')
      return { state, error: 'Choose an available status.' };
    updated = {
      ...record,
      event: {
        ...record.event,
        title: input.name,
        notes: input.notes,
        intention,
        placeId: input.cityId,
      },
      places: [
        ...record.places,
        ...state.cities
          .filter((city) => !record.places.some((place) => place.id === city.id))
          .map((city) => ({ ...city })),
      ],
    };
  }
  return {
    state: { ...state, records: state.records.map((entry) => (entry.id === id ? updated : entry)) },
    error: null,
  };
}

/** Removes only a collection entry; previous source snapshots remain intact for local undo. */
export function removeExploreRecord(state: ExploreState, id: string): ExploreState {
  return state.records.some((record) => record.id === id)
    ? { ...state, records: state.records.filter((record) => record.id !== id) }
    : state;
}
