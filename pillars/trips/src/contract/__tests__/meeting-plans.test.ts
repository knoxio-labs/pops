import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MeetingPlanOperationSchema, MeetingPlanPatchSchema } from '../meeting-plan-schemas.js';

describe('Independent meeting source contract', () => {
  it('retains empty/partial/reversed date facts and independently selected agreement', () => {
    for (const patch of [
      {},
      { startDate: null, endDate: '2028-02-01' },
      { startDate: '2028-02-10', endDate: '2028-02-01' },
      { intention: 'Considering', agreement: 'Agreed' },
    ])
      expect(MeetingPlanPatchSchema.parse(patch)).toEqual(patch);
  });
  it('rejects invalid dates, clocks, foreign identities and unsafe/missing revisions', () => {
    for (const patch of [
      { startDate: '2028-02-30' },
      { startDate: '2028-02-10T00:00:00Z' },
      { startTime: '10:00' },
      { contactUri: 'pops:contacts/entity/id' },
      { contactUri: 'pops:finance/contact/id' },
      { contactUri: 'pops:contacts/contact/' },
      { intention: 'Agreed' },
      { agreement: 'Purchased' },
    ])
      expect(MeetingPlanPatchSchema.safeParse(patch).success).toBe(false);
    for (const expectedRevision of [undefined, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(
        MeetingPlanOperationSchema.safeParse({
          operationId: randomUUID(),
          command: { kind: 'remove', id: 1, expectedRevision },
        }).success
      ).toBe(false);
  });
});
