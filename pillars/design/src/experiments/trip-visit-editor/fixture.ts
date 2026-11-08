import { beginNewVisit, type VisitDraft, type VisitEditorState } from './model';

/** Fictional local snapshots for unknown dates, approximate timing, source conflicts and broken city links. */
export type VisitEditorScenario =
  | 'default'
  | 'empty'
  | 'approximate'
  | 'conflict'
  | 'missing-reference';

function visit(id: string, placeId: string, changes: Partial<VisitDraft> = {}): VisitDraft {
  return {
    id,
    placeId,
    arrival: '',
    departure: '',
    month: '',
    part: '',
    durationMin: '',
    durationMax: '',
    durationUnit: 'days',
    notes: '',
    ...changes,
  };
}

function sourceStays(): VisitEditorState['stays'] {
  return [
    {
      id: 'stay-jardim',
      visitId: 'visit-curitiba',
      title: 'Hotel Jardim',
      from: '2027-12-14',
      to: '2027-12-18',
      status: 'Purchased',
    },
    {
      id: 'stay-ipe',
      visitId: 'visit-curitiba',
      title: 'Hotel Ipê',
      from: '2027-12-18',
      to: '2027-12-20',
      status: 'Purchased',
    },
    {
      id: 'stay-reserved',
      visitId: 'visit-porto-alegre',
      title: 'Pousada do Parque',
      from: '2027-12-20',
      to: '2027-12-24',
      status: 'Reserved',
    },
  ];
}

function sourceState(): VisitEditorState {
  const curitiba = visit('visit-curitiba', 'place-curitiba', {
    month: '2027-12',
    durationMin: '2',
    durationMax: '3',
    durationUnit: 'weeks',
  });
  const state: VisitEditorState = {
    visits: [
      visit('visit-sao-paulo', 'place-sao-paulo', { arrival: '2027-11-25' }),
      curitiba,
      visit('visit-porto-alegre', 'place-porto-alegre', {
        arrival: '2027-12-20',
        departure: '2027-12-29',
      }),
    ],
    places: [
      { id: 'place-sao-paulo', name: 'São Paulo' },
      { id: 'place-curitiba', name: 'Curitiba' },
      { id: 'place-porto-alegre', name: 'Porto Alegre' },
    ],
    selectedId: curitiba.id,
    draft: { ...curitiba },
    creating: false,
    stays: sourceStays(),
    events: [
      {
        id: 'event-birthday',
        visitId: curitiba.id,
        title: 'Birthday · wanted',
        date: '2027-12-16',
      },
    ],
  };
  return state;
}

/** Returns independent fictional city visits and arrangement sources; source dates never populate city dates. */
export function initialVisitEditor(scenario: VisitEditorScenario = 'default'): VisitEditorState {
  const state = sourceState();
  const curitiba = state.draft;
  if (scenario === 'empty') return beginNewVisit(state, curitiba.id, 'visit-new');
  if (scenario === 'approximate') {
    state.draft = { ...curitiba, durationMin: '', durationMax: '' };
    state.visits = state.visits.map((source) =>
      source.id === curitiba.id ? { ...state.draft } : source
    );
  }
  if (scenario === 'conflict') {
    state.draft = { ...curitiba, arrival: '2027-12-17', departure: '2027-12-18' };
    state.visits = state.visits.map((source) =>
      source.id === curitiba.id ? { ...state.draft } : source
    );
  }
  if (scenario === 'missing-reference')
    state.places = state.places.filter((place) => place.id !== curitiba.placeId);
  return state;
}
