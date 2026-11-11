import { describe, expect, it } from 'vitest';

import { sourceVisits } from '../stay/test-utils';
import { groupMeetingPlans } from './model';
import { meetingPlan } from './test-utils';

describe('meeting route grouping', () => {
  it('keeps repeated towns distinct under actual persisted Visit order, with unavailable and unassociated identities separate', () => {
    const visit = sourceVisits[0];
    if (!visit) throw new Error('Expected visit fixture');
    const visits = [
      { ...visit, id: 90 },
      { ...visit, id: 2 },
    ];
    const plans = [
      meetingPlan({ id: 1, visitId: 2 }),
      meetingPlan({ id: 2, visitId: null }),
      meetingPlan({ id: 3, visitId: 90 }),
      meetingPlan({ id: 4, visitId: 999 }),
      meetingPlan({ id: 5, visitId: 90, removed: true }),
    ];
    expect(
      groupMeetingPlans(plans, visits).map((group) => ({
        visitId: group.visitId,
        ids: group.plans.map((plan) => plan.id),
      }))
    ).toEqual([
      { visitId: 90, ids: [3] },
      { visitId: 2, ids: [1] },
      { visitId: null, ids: [2] },
      { visitId: 999, ids: [4] },
    ]);
  });
  it('never changes partial or reversed source dates while grouping', () => {
    const partial = meetingPlan();
    const reversed = meetingPlan({ id: 2, startDate: '2030-02-01', endDate: '2030-01-01' });
    expect(groupMeetingPlans([partial, reversed], [])[0]?.plans).toEqual([partial, reversed]);
    expect(groupMeetingPlans([], sourceVisits)).toEqual([]);
  });
});
