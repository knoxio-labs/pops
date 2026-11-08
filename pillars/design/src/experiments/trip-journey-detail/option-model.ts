import { initialJourney } from './fixture';

import type { JourneyScenario, JourneyState } from './model';

/** A separately retained source journey available for comparison or selection. */
export interface JourneyOption {
  id: string;
  journey: JourneyState;
}

/** The working journey and independent alternatives; previewing never selects an option. */
export interface JourneyOptionsState {
  current: JourneyState;
  options: JourneyOption[];
}

function fictionalAlternative(): JourneyState {
  const source = initialJourney('default');
  const departures = ['2028-01-18T10:00', '2028-01-18T13:00'];
  const arrivals = ['2028-01-18T08:15', '2028-01-19T00:30'];
  return {
    ...source,
    reference: '',
    documentIds: [],
    context: [],
    notes: 'Fictional later departure with a longer Dallas connection; no booking made.',
    legs: source.legs.map((leg, index) => ({
      ...leg,
      id: `alternative-${leg.id}`,
      from: { ...leg.from, local: departures[index] ?? '' },
      to: { ...leg.to, local: arrivals[index] ?? '' },
      status: 'Considering',
      reference: '',
    })),
  };
}

/** Creates fictional source alternatives without treating any alternative as a purchased booking. */
export function initialJourneyOptions(scenario: JourneyScenario): JourneyOptionsState {
  return {
    current: initialJourney(scenario),
    options:
      scenario === 'empty' ? [] : [{ id: 'later-departure', journey: fictionalAlternative() }],
  };
}

/** Swaps a selected source into the working journey and retains every previous source fact as an option. */
export function selectJourneyOption(state: JourneyOptionsState, id: string): JourneyOptionsState {
  const selected = state.options.find((option) => option.id === id);
  if (!selected) return state;
  const previous = { id: crypto.randomUUID(), journey: state.current };
  return {
    current: selected.journey,
    options: state.options.map((option) => (option.id === id ? previous : option)),
  };
}

/** Adds an empty alternative using current catalogues and configured buffers, with no selected facts. */
export function addJourneyOption(state: JourneyOptionsState): JourneyOptionsState {
  const journey: JourneyState = {
    locations: state.current.locations,
    documents: state.current.documents,
    minimumConnectionMinutes: state.current.minimumConnectionMinutes,
    airportBufferMinutes: state.current.airportBufferMinutes,
    legs: [],
    documentIds: [],
    reference: '',
    notes: '',
    context: [],
  };
  return { ...state, options: [...state.options, { id: crypto.randomUUID(), journey }] };
}

/** Replaces only the named alternative; missing identifiers preserve the original state. */
export function updateJourneyOption(
  state: JourneyOptionsState,
  id: string,
  journey: JourneyState
): JourneyOptionsState {
  if (!state.options.some((option) => option.id === id)) return state;
  return {
    ...state,
    options: state.options.map((option) => (option.id === id ? { ...option, journey } : option)),
  };
}
