import type { Visit } from '../stay/types';
import type { MeetingPlan } from './types';

/** A group retains the exact Visit occurrence, or an explicit unavailable/unassociated bucket. */
export interface PeopleGroup {
  key: string;
  visit: Visit | undefined;
  visitId: number | null;
  plans: MeetingPlan[];
}

/** Group by actual persisted route order; repeated place names never join distinct occurrences. */
export function groupMeetingPlans(plans: MeetingPlan[], visits: Visit[]): PeopleGroup[] {
  const live = plans.filter((plan) => !plan.removed);
  const ordered = visits.map((visit) => ({
    key: `visit:${visit.id}`,
    visit,
    visitId: visit.id,
    plans: live.filter((plan) => plan.visitId === visit.id),
  }));
  const missing = new Map<number | null, PeopleGroup>();
  for (const plan of live) {
    if (visits.some((visit) => visit.id === plan.visitId)) continue;
    const group = missing.get(plan.visitId) ?? {
      key: `missing:${plan.visitId}`,
      visit: undefined,
      visitId: plan.visitId,
      plans: [],
    };
    group.plans.push(plan);
    missing.set(plan.visitId, group);
  }
  return [...ordered.filter((group) => group.plans.length), ...missing.values()];
}
