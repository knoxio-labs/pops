import type { DecisionState } from './model';

/** Fictional decision states for capture, selection, broken links and date validation. */
export type DecisionScenario =
  | 'default'
  | 'empty'
  | 'selected'
  | 'missing-reference'
  | 'invalid-deadline';

function januaryDecision(): DecisionState {
  return {
    question: 'January route',
    deadline: '2027-12-15',
    selectedOptionId: '',
    options: [
      {
        id: 'northeast',
        title: 'Stay in the Northeast',
        notes: 'Beaches north of Olinda.',
        affectedIds: ['visit-olinda', 'visit-rio'],
      },
      {
        id: 'minas',
        title: 'Head inland to Minas Gerais',
        notes: 'Meet people in Belo Horizonte; visit Minas Gerais.',
        affectedIds: ['visit-rio'],
      },
      {
        id: 'espirito-santo',
        title: 'Explore Espírito Santo',
        notes: 'Vitória and nearby coast.',
        affectedIds: ['visit-rio'],
      },
    ],
    arrangements: [
      {
        id: 'visit-olinda',
        title: 'Olinda',
        kind: 'visit',
        from: '2027-12-28',
        to: '2028-01-06',
        status: 'Planned',
      },
      {
        id: 'visit-rio',
        title: 'Rio de Janeiro',
        kind: 'visit',
        from: '2028-02-05',
        to: '2028-02-13',
        status: 'Planned',
      },
    ],
    notes: '',
  };
}

/** Return an independent editable snapshot; empty capture retains its available arrangement catalogue. */
export function initialDecision(scenario: DecisionScenario = 'default'): DecisionState {
  const state = januaryDecision();
  if (scenario === 'empty') return { ...state, question: '', deadline: '', options: [], notes: '' };
  if (scenario === 'selected') return { ...state, selectedOptionId: 'minas' };
  if (scenario === 'missing-reference')
    return {
      ...state,
      selectedOptionId: 'removed-option',
      options: state.options.map((option, index) =>
        index === 0 ? { ...option, affectedIds: ['removed-arrangement'] } : option
      ),
    };
  if (scenario === 'invalid-deadline') return { ...state, deadline: '2028-02-30' };
  return state;
}
