import { useQueries } from '@tanstack/react-query';

import { meetingContactQuery } from './contact-query';

import type { PeopleFilters, PeopleSectionProps } from './PeopleControls';
import type { MeetingPlan } from './types';

/** Search only published meeting, Visit and owner-resolved Contact facts; equal names never join identities. */
export function useFilteredMeetings(
  plans: MeetingPlan[],
  filters: PeopleFilters,
  props: Pick<PeopleSectionProps, 'context' | 'workspace'>
): MeetingPlan[] {
  const uris = [
    ...new Set(
      plans.flatMap((plan) => (plan.contactUri && !plan.removed ? [plan.contactUri] : []))
    ),
  ];
  const contacts = useQueries({
    queries: uris.map((uri) => meetingContactQuery(props.workspace.contacts, uri)),
  });
  const names = new Map(
    uris.map((uri, index) => {
      const contact = contacts[index]?.data;
      return [uri, contact?.status === 'available' ? contact.name : ''];
    })
  );
  return plans.filter(
    (plan) =>
      matchesFilters(plan, filters) &&
      meetingFacts(plan, names, props.context).some((value) =>
        value.toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase())
      )
  );
}
function matchesFilters(plan: MeetingPlan, filters: PeopleFilters): boolean {
  if (filters.intention && filters.intention !== plan.intention) return false;
  if (filters.agreement && filters.agreement !== plan.agreement) return false;
  return !filters.visitId || filters.visitId === String(plan.visitId);
}
function meetingFacts(
  plan: MeetingPlan,
  names: Map<string, string>,
  context: PeopleSectionProps['context']
): string[] {
  const visit = context.visits.data?.find((entry) => entry.id === plan.visitId);
  const place = context.places.data?.find((entry) => entry.id === visit?.placeId);
  return [
    plan.title,
    plan.notes,
    plan.contactUri ?? '',
    plan.startDate ?? '',
    plan.endDate ?? '',
    plan.intention,
    plan.agreement,
    place?.name ?? '',
    names.get(plan.contactUri ?? '') ?? '',
  ];
}
