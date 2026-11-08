import { describe, expect, it } from 'vitest';

import {
  CreateJourneyGroupBody,
  JourneyGroupRevisionBody,
  SelectJourneyBody,
} from '../journey-groups.js';

describe('Journey grouping contract', () => {
  it('requires an explicitly chosen current and distinct source membership', () => {
    expect(CreateJourneyGroupBody.parse({ currentJourneyId: 1 })).toEqual({ currentJourneyId: 1 });
    expect(
      CreateJourneyGroupBody.parse({ currentJourneyId: 1, alternativeJourneyIds: [2, 3] })
    ).toEqual({ currentJourneyId: 1, alternativeJourneyIds: [2, 3] });
    for (const input of [
      {},
      { currentJourneyId: 0 },
      { currentJourneyId: 1, alternativeJourneyIds: [1] },
      { currentJourneyId: 1, alternativeJourneyIds: [2, 2] },
    ])
      expect(CreateJourneyGroupBody.safeParse(input).success).toBe(false);
  });

  it('requires explicit nonnegative integer revisions and explicit selected source identity', () => {
    for (const input of [
      {},
      { expectedRevision: -1 },
      { expectedRevision: 0.5 },
      { expectedRevision: '0' },
    ])
      expect(JourneyGroupRevisionBody.safeParse(input).success).toBe(false);
    expect(JourneyGroupRevisionBody.parse({ expectedRevision: 0 })).toEqual({
      expectedRevision: 0,
    });
    expect(SelectJourneyBody.safeParse({ expectedRevision: 0 }).success).toBe(false);
    expect(SelectJourneyBody.parse({ expectedRevision: 2, journeyId: 3 })).toEqual({
      expectedRevision: 2,
      journeyId: 3,
    });
  });
});
