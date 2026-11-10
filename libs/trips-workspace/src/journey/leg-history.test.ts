import { describe, expect, it } from 'vitest';

import { nextJourneyHistory } from './leg-history';
import { sourceJourney } from './test-utils';

import type { JourneyChange, JourneyChangeResult, JourneyCommand } from './types';

const first: JourneyChange = { kind: 'restore', operationId: 'first', expectedRevision: 1 };
const second: JourneyChange = { kind: 'restore', operationId: 'second', expectedRevision: 2 };
const command: JourneyCommand = {
  kind: 'remove',
  id: 42,
  operationId: 'second',
  expectedRevision: 1,
};
function result(revision: number): JourneyChangeResult {
  return { source: { journey: sourceJourney(), legs: [], legRevision: revision }, inverse: second };
}

describe('leg inverse revision ownership', () => {
  it('rebases retained inverses across only a confirmed own successor for LIFO restoration', () => {
    const removed = nextJourneyHistory([first], result(2), command, false);
    expect(removed).toEqual([{ ...first, expectedRevision: 2 }, second]);
    const restored = nextJourneyHistory(
      removed,
      { source: result(3).source },
      { kind: 'restore', operationId: 'second', expectedRevision: 2 },
      true
    );
    expect(restored).toEqual([{ ...first, expectedRevision: 3 }]);
  });

  it('never adopts an unrelated revision from a replay response', () => {
    expect(nextJourneyHistory([first], result(3), command, false)).toEqual([]);
    expect(
      nextJourneyHistory([first], { ...result(2), clearHistory: true }, command, false)
    ).toEqual([]);
  });

  it('does not rewrite leg guards after an independent journey metadata edit', () => {
    expect(
      nextJourneyHistory(
        [first],
        { source: result(9).source },
        { kind: 'journey', patch: { notes: 'source' } },
        false
      )
    ).toEqual([first]);
  });
});
