import { isTripDate } from '../trip-route-editing/lodging-periods';

/** Editable fictional decision; choosing an option records intent without editing arrangements. */
export interface DecisionState {
  question: string;
  deadline: string;
  selectedOptionId: string;
  options: { id: string; title: string; notes: string; affectedIds: string[] }[];
  arrangements: {
    id: string;
    title: string;
    kind: 'visit' | 'transport' | 'stay' | 'event';
    from: string;
    to: string;
    status: 'Planned' | 'Reserved' | 'Purchased';
  }[];
  notes: string;
}

/** A discrepancy in explicitly captured decision data, without inferred route consequences. */
export interface DecisionFinding {
  id: string;
  title: string;
  detail: string;
}

/** Report invalid deadlines and unavailable selections or affected references in source order. */
export function decisionFindings(state: DecisionState): DecisionFinding[] {
  const findings: DecisionFinding[] = [];
  if (state.deadline && !isTripDate(state.deadline))
    findings.push({
      id: 'invalid-deadline',
      title: 'Check the deadline',
      detail: 'Enter a valid calendar date.',
    });
  if (
    state.selectedOptionId &&
    !state.options.some((option) => option.id === state.selectedOptionId)
  )
    findings.push({
      id: 'missing-selected-option',
      title: 'Selected option unavailable',
      detail: 'Choose an option again or reopen the decision.',
    });
  state.options.forEach((option, optionIndex) => {
    option.affectedIds.forEach((id, referenceIndex) => {
      if (id && !state.arrangements.some((arrangement) => arrangement.id === id))
        findings.push({
          id: `missing-affected-${optionIndex}-${referenceIndex}`,
          title: 'Linked arrangement unavailable',
          detail: `${option.title || 'An option'} references an arrangement that is unavailable.`,
        });
    });
  });
  return findings;
}

/** Format only a valid captured deadline; an absent or invalid date has no display label. */
export function decisionDeadlineLabel(state: DecisionState): string {
  if (!isTripDate(state.deadline)) return '';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${state.deadline}T00:00:00Z`));
}

/** Select an existing option only; retain all other data and ignore unavailable option IDs. */
export function selectDecisionOption(state: DecisionState, id: string): DecisionState {
  return state.options.some((option) => option.id === id)
    ? { ...state, selectedOptionId: id }
    : state;
}

/** Clear only the recorded choice, retaining the options and source arrangements. */
export function reopenDecision(state: DecisionState): DecisionState {
  return { ...state, selectedOptionId: '' };
}

/** Remove an option and clear its selection when necessary; never delete source arrangements. */
export function removeDecisionOption(state: DecisionState, id: string): DecisionState {
  if (!state.options.some((option) => option.id === id)) return state;
  return {
    ...state,
    selectedOptionId: state.selectedOptionId === id ? '' : state.selectedOptionId,
    options: state.options.filter((option) => option.id !== id),
  };
}
