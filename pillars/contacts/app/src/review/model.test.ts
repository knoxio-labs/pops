import { describe, expect, it } from 'vitest';

import {
  chooseCandidate,
  emptyChoices,
  selectedCandidates,
  type ReviewChoices,
  type ReviewItem,
} from './model';

const item: ReviewItem = {
  id: 'row',
  proposalRevision: 'proposal-row',
  candidateTotal: 3,
  candidateOffset: 0,
  candidateLimit: 50,
  name: 'Alex Smith',
  source: 'vCard',
  points: [],
  candidates: ['a', 'b', 'c'].map((id) => ({
    id,
    entityId: id,
    localName: id,
    sourceOptions: [],
    name: id,
    points: [],
    sources: [],
    reasons: [],
    keepSeparate: false,
  })),
  status: 'Review',
  errors: [],
  processed: false,
};

function candidate(id: string) {
  const found = item.candidates.find((entry) => entry.id === id);
  if (!found) throw new Error('Missing candidate fixture');
  return found;
}

describe('review candidate subsets', () => {
  it('never includes a candidate by default', () => {
    expect(selectedCandidates(item, emptyChoices())).toEqual({
      mergeEntityIds: [],
      differentEntityIds: [],
      laterEntityIds: [],
    });
  });
  it('keeps selected, different and deferred candidates independent', () => {
    let choices = chooseCandidate(emptyChoices(), candidate('a'), 'merge');
    choices = chooseCandidate(choices, candidate('b'), 'different');
    choices = chooseCandidate(choices, candidate('c'), 'later');
    expect(selectedCandidates(item, choices)).toEqual({
      mergeEntityIds: ['a'],
      differentEntityIds: ['b'],
      laterEntityIds: ['c'],
    });
  });
  it('clears preferred fields when their owner leaves a merge', () => {
    const choices = chooseCandidate(
      {
        candidates: { a: 'merge' },
        nameEntityId: 'a',
        profileEntityId: 'a',
        preferredPointIds: ['point-a'],
      },
      { ...candidate('a'), points: [{ id: 'point-a', kind: 'email', value: 'a@example.test' }] },
      'later'
    );
    expect(choices.nameEntityId).toBeUndefined();
    expect(choices.profileEntityId).toBeUndefined();
    expect(choices.preferredPointIds).toEqual([]);
  });
  it('refuses unknown candidates and remembered exclusions', () => {
    expect(() =>
      selectedCandidates(item, { ...emptyChoices(), candidates: { missing: 'merge' } })
    ).toThrow('evidence changed');
    expect(() =>
      selectedCandidates(
        { ...item, candidates: [{ ...item.candidates[0]!, keepSeparate: true }] },
        { ...emptyChoices(), candidates: { a: 'merge' } }
      )
    ).toThrow('different-person');
  });
});

it('retains preferred values when another candidate is deferred', () => {
  const before = {
    ...emptyChoices(),
    candidates: { a: 'merge' as const },
    nameSourceRecordId: 'source-a',
    preferredPointIds: ['point-a'],
  };
  const after = chooseCandidate(before, candidate('b'), 'later');
  expect(after.nameSourceRecordId).toBe('source-a');
  expect(after.preferredPointIds).toEqual(['point-a']);
});

it('clears incoming replacements when the final merge target is deferred', () => {
  const first = chooseCandidate(emptyChoices(), candidate('a'), 'merge');
  const selected: ReviewChoices = { ...first, incomingFields: ['name', 'personProfile'] };
  const second = chooseCandidate(selected, candidate('b'), 'merge');
  expect(chooseCandidate(second, candidate('a'), 'later').incomingFields).toEqual([
    'name',
    'personProfile',
  ]);
  expect(chooseCandidate(selected, candidate('a'), 'later').incomingFields).toBeUndefined();
});
