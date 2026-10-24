import { useState } from 'react';

/** Decisions affect one candidate; unanswered candidates remain pending. */
export type CandidateChoice = 'merge' | 'different' | 'later';
/** Row decisions apply only the selected subset or defer the incoming contact. */
export type Choice = 'Merge selected' | 'Keep separate' | 'Later';
/** Local decisions persist while moving between queue entries. */
export interface ReviewModel {
  selected: string;
  choices: Partial<Record<string, Choice>>;
  candidates: Record<string, Partial<Record<string, CandidateChoice>>>;
  select: (id: string) => void;
  decideCandidate: (rowId: string, candidateId: string, choice: CandidateChoice) => void;
  choose: (id: string, choice: Choice) => void;
}

/** Models a merge subset independently from excluded and deferred candidates. */
export function useReviewModel(initialSubset: boolean): ReviewModel {
  const [selected, select] = useState('ambiguous');
  const [choices, setChoices] = useState<ReviewModel['choices']>({ separate: 'Keep separate' });
  const [candidates, setCandidates] = useState<ReviewModel['candidates']>(() => ({
    separate: { robin: 'different' },
    ...(initialSubset
      ? { ambiguous: { 'alex-design': 'merge', 'alex-music': 'different', 'alex-studio': 'later' } }
      : {}),
  }));
  return {
    selected,
    choices,
    candidates,
    select,
    decideCandidate: (rowId, candidateId, choice) => {
      setCandidates((previous) => {
        const row = previous[rowId] ?? {};
        return {
          ...previous,
          [rowId]: { ...row, [candidateId]: row[candidateId] === choice ? undefined : choice },
        };
      });
      setChoices((previous) => ({ ...previous, [rowId]: undefined }));
    },
    choose: (id, choice) => setChoices((previous) => ({ ...previous, [id]: choice })),
  };
}
