/** Editable city-visit facts; empty timing fields remain unknown and exact and approximate facts coexist. */
export interface VisitDraft {
  id: string;
  placeId: string;
  arrival: string;
  departure: string;
  month: string;
  part: '' | 'early' | 'middle' | 'late';
  durationMin: string;
  durationMax: string;
  durationUnit: 'days' | 'weeks';
  notes: string;
}

/** Independent local visit snapshots and separately owned, read-only arrangement sources. */
export interface VisitEditorState {
  visits: VisitDraft[];
  places: { id: string; name: string }[];
  selectedId: string;
  draft: VisitDraft;
  creating: boolean;
  stays: {
    id: string;
    visitId: string;
    title: string;
    from: string;
    to: string;
    status: 'Reserved' | 'Purchased';
  }[];
  events: { id: string; visitId: string; title: string; date: string }[];
}

function emptyVisit(id: string): VisitDraft {
  return {
    id,
    placeId: '',
    arrival: '',
    departure: '',
    month: '',
    part: '',
    durationMin: '',
    durationMax: '',
    durationUnit: 'days',
    notes: '',
  };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validDuration(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function durationErrors(draft: VisitDraft): string[] {
  const errors: string[] = [];
  if (draft.durationMin && !validDuration(draft.durationMin))
    errors.push('Minimum duration must be a finite non-negative number.');
  if (draft.durationMax && !validDuration(draft.durationMax))
    errors.push('Maximum duration must be a finite non-negative number.');
  if (
    validDuration(draft.durationMin) &&
    validDuration(draft.durationMax) &&
    Number(draft.durationMax) < Number(draft.durationMin)
  )
    errors.push('Maximum duration must not precede minimum duration.');
  return errors;
}

function outsideStay(draft: VisitDraft, stay: VisitEditorState['stays'][number]): boolean {
  return (
    (validDate(draft.arrival) && validDate(stay.from) && draft.arrival > stay.from) ||
    (validDate(draft.departure) && validDate(stay.to) && draft.departure < stay.to)
  );
}

/** Structural errors prevent a save; contradictory timing is deliberately handled as findings instead. */
export function visitErrors(state: VisitEditorState, draft: VisitDraft): string[] {
  const errors = durationErrors(draft);
  if (!state.places.some((place) => place.id === draft.placeId))
    errors.push('Choose an available city.');
  if (draft.arrival && !validDate(draft.arrival))
    errors.push('Arrival must be a valid calendar date.');
  if (draft.departure && !validDate(draft.departure))
    errors.push('Departure must be a valid calendar date.');
  if (draft.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.month))
    errors.push('Approximate month must be a valid year and month.');
  return errors;
}

/** Reports source conflicts without changing city timing or treating unknown bounds as specific gaps. */
export function visitFindings(
  state: VisitEditorState,
  draft: VisitDraft
): { id: string; message: string }[] {
  const findings: { id: string; message: string }[] = [];
  if (draft.placeId && !state.places.some((place) => place.id === draft.placeId))
    findings.push({
      id: 'missing-place',
      message: 'The linked city is unavailable. Choose a reusable city to repair this visit.',
    });
  if (validDate(draft.arrival) && validDate(draft.departure) && draft.arrival > draft.departure)
    findings.push({
      id: 'reversed-dates',
      message: 'Arrival is after departure. These visit dates remain editable.',
    });
  for (const stay of state.stays.filter((source) => source.visitId === draft.id)) {
    if (outsideStay(draft, stay))
      findings.push({
        id: `stay-${stay.id}`,
        message: `${stay.title} (${stay.status}) extends outside the entered visit dates. ${stay.status === 'Purchased' ? 'Purchased dates remain fixed at their source.' : 'Reservation dates remain at their source.'}`,
      });
  }
  return findings;
}

/** Saves only structurally valid facts; creating inserts after the selected visit and never changes arrangements. */
export function commitVisit(state: VisitEditorState, draft: VisitDraft): VisitEditorState {
  if (visitErrors(state, draft).length) return state;
  let visits: VisitDraft[];
  if (state.creating) {
    if (state.visits.some((visit) => visit.id === draft.id)) return state;
    const selectedIndex = state.visits.findIndex((visit) => visit.id === state.selectedId);
    const insertionIndex = selectedIndex < 0 ? state.visits.length : selectedIndex + 1;
    visits = [
      ...state.visits.slice(0, insertionIndex),
      { ...draft },
      ...state.visits.slice(insertionIndex),
    ];
  } else {
    if (!state.visits.some((visit) => visit.id === draft.id)) return state;
    visits = state.visits.map((visit) => (visit.id === draft.id ? { ...draft } : visit));
  }
  return { ...state, visits, selectedId: draft.id, draft: { ...draft }, creating: false };
}

/** Selects an existing visit with a separate editable copy; an unavailable identity leaves state unchanged. */
export function beginVisit(state: VisitEditorState, id: string): VisitEditorState {
  const visit = state.visits.find((candidate) => candidate.id === id);
  return visit ? { ...state, selectedId: id, draft: { ...visit }, creating: false } : state;
}

/** Starts an empty visit after an explicit route position without inferring a city or timing. */
export function beginNewVisit(
  state: VisitEditorState,
  afterId: string,
  newId: string
): VisitEditorState {
  return { ...state, selectedId: afterId, draft: emptyVisit(newId), creating: true };
}

/** Adds a named reusable place and selects it in the draft without saving or renaming existing places. */
export function addVisitPlace(state: VisitEditorState, name: string, id: string): VisitEditorState {
  if (!name.trim() || !id || state.places.some((place) => place.id === id)) return state;
  return {
    ...state,
    places: [...state.places, { id, name: name.trim() }],
    draft: { ...state.draft, placeId: id },
  };
}

/** Discards draft edits, returning new-visit capture to its selected source when that source still exists. */
export function resetVisitDraft(state: VisitEditorState): VisitEditorState {
  const selected = state.visits.find((visit) => visit.id === state.selectedId);
  return selected
    ? { ...state, draft: { ...selected }, creating: false }
    : { ...state, draft: emptyVisit(state.draft.id) };
}

/** Resolves route names from reusable place data without exposing an unavailable reference identifier. */
export function routeLabel(state: VisitEditorState, visit: VisitDraft): string {
  return state.places.find((place) => place.id === visit.placeId)?.name ?? 'City unavailable';
}

/** Formats entered valid timing facts only; exact and approximate descriptions remain independent. */
export function visitTimingLabel(draft: VisitDraft): string {
  const facts: string[] = [];
  const exact = exactTimingLabel(draft);
  if (exact) facts.push(exact);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.month))
    facts.push(
      `${draft.part ? `${draft.part} ` : ''}${new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${draft.month}-01T12:00:00Z`))}`
    );
  const minimum = validDuration(draft.durationMin) ? draft.durationMin : '';
  const maximum = validDuration(draft.durationMax) ? draft.durationMax : '';
  if (minimum && maximum) facts.push(`${minimum}–${maximum} ${draft.durationUnit}`);
  else if (minimum) facts.push(`At least ${minimum} ${draft.durationUnit}`);
  else if (maximum) facts.push(`Up to ${maximum} ${draft.durationUnit}`);
  return facts.join(' · ');
}

/** Format a source calendar date without shifting it to the viewer timezone. */
export function visitDateLabel(date: string): string {
  return validDate(date)
    ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(`${date}T12:00:00Z`)
      )
    : date;
}

function exactTimingLabel(draft: VisitDraft): string {
  if (validDate(draft.arrival) || validDate(draft.departure))
    return `${validDate(draft.arrival) ? visitDateLabel(draft.arrival) : ''} → ${validDate(draft.departure) ? visitDateLabel(draft.departure) : ''}`.trim();
  return '';
}
