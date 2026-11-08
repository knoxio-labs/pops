import { describe, expect, it } from 'vitest';

import { initialDecision } from './fixture';
import {
  decisionDeadlineLabel,
  decisionFindings,
  removeDecisionOption,
  reopenDecision,
  selectDecisionOption,
} from './model';

describe('decision sources', () => {
  it('retains arrangement sources when capturing an empty decision', () => {
    const empty = initialDecision('empty');
    expect([empty.question, empty.deadline, empty.selectedOptionId, empty.notes]).toEqual([
      '',
      '',
      '',
      '',
    ]);
    expect(empty.options).toEqual([]);
    expect(empty.arrangements).toEqual(initialDecision().arrangements);
    expect(decisionFindings(empty)).toEqual([]);
    expect(decisionDeadlineLabel(empty)).toBe('');
  });

  it('creates independent nested editable snapshots', () => {
    const state = initialDecision();
    const original = structuredClone(state);
    state.options[0]?.affectedIds.push('another-arrangement');
    state.options.push({ id: 'custom', title: 'Another idea', notes: '', affectedIds: [] });
    const arrangement = state.arrangements[0];
    if (arrangement) arrangement.title = 'Edited title';
    expect(initialDecision()).toEqual(original);
  });

  it('reports unavailable selected and affected references without replacing sources', () => {
    const state = initialDecision('missing-reference');
    const original = structuredClone(state);
    expect(decisionFindings(state).map(({ id }) => id)).toEqual([
      'missing-selected-option',
      'missing-affected-0-0',
    ]);
    expect(state).toEqual(original);
  });

  it('checks every option in source order and ignores blank optional references', () => {
    const state = initialDecision('empty');
    state.options = [
      { id: 'one', title: '', notes: '', affectedIds: ['', 'missing-one'] },
      { id: 'two', title: 'Other', notes: '', affectedIds: ['missing-two'] },
    ];
    expect(decisionFindings(state).map(({ id }) => id)).toEqual([
      'missing-affected-0-1',
      'missing-affected-1-0',
    ]);
  });
});

describe('recording a decision', () => {
  it('selects any available option without editing alternatives or arrangements', () => {
    const state = initialDecision();
    state.options.push({ id: 'custom', title: 'An arbitrary choice', notes: '', affectedIds: [] });
    const original = structuredClone(state);
    const selected = selectDecisionOption(state, 'custom');
    expect(selected).toEqual({ ...original, selectedOptionId: 'custom' });
    expect(selected.options).toBe(state.options);
    expect(selected.arrangements).toBe(state.arrangements);
    expect(state).toEqual(original);
    expect(selectDecisionOption(state, 'missing')).toBe(state);
  });

  it('reopens a decision by clearing only its choice', () => {
    const state = initialDecision('selected');
    const original = structuredClone(state);
    expect(reopenDecision(state)).toEqual({ ...original, selectedOptionId: '' });
    expect(state).toEqual(original);
  });

  it('clears selection when removing its option while retaining source arrangements', () => {
    const state = initialDecision('selected');
    const original = structuredClone(state);
    const removed = removeDecisionOption(state, 'minas');
    expect(removed.selectedOptionId).toBe('');
    expect(removed.options).toEqual(original.options.filter(({ id }) => id !== 'minas'));
    expect(removed.arrangements).toBe(state.arrangements);
    expect(state).toEqual(original);
    expect(removeDecisionOption(state, 'northeast').selectedOptionId).toBe('minas');
    expect(removeDecisionOption(state, 'unavailable')).toBe(state);
  });
});

describe('decision deadline', () => {
  it.each(['2028-02-30', '2027-02-29', '2028-13-01', '2028-1-01', 'invalid'])(
    'rejects invalid calendar date %s without formatting it',
    (deadline) => {
      const state = { ...initialDecision(), deadline };
      expect(decisionFindings(state).map(({ id }) => id)).toEqual(['invalid-deadline']);
      expect(decisionDeadlineLabel(state)).toBe('');
    }
  );

  it('formats the captured date including a valid leap day, independent of arrangements', () => {
    const state = { ...initialDecision(), deadline: '2028-02-29' };
    const original = structuredClone(state);
    expect(decisionDeadlineLabel(state)).toBe('29 Feb 2028');
    expect(decisionFindings(state)).toEqual([]);
    expect(state).toEqual(original);
  });
});
