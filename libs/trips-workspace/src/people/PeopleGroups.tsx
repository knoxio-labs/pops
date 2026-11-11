import { MeetingCard } from './MeetingCard';
import { groupMeetingPlans } from './model';
import { useFilteredMeetings } from './use-filtered-meetings';

import type { JSX, ComponentProps } from 'react';

import type { PeopleGroup } from './model';
import type { PeopleFilters, PeopleSectionProps } from './PeopleControls';

/** Render exact Visit occurrences with independent meeting identities and a dotted route hierarchy. */
export function PeopleGroups({
  state,
  editor,
  context,
  workspace,
  filters,
}: PeopleSectionProps & { filters: PeopleFilters }): JSX.Element {
  const filtered = useFilteredMeetings(state.plans, filters, { context, workspace });
  const plans =
    workspace.meetingId === undefined
      ? filtered
      : state.plans.filter(
          (plan) =>
            plan.id === workspace.meetingId && plan.tripId === workspace.tripId && !plan.removed
        );
  if (workspace.meetingId !== undefined && plans.length === 0)
    return (
      <p role="alert" className="text-sm text-destructive">
        {workspace.text('contextFailed')} <code>trips.people.meeting_unavailable</code>
      </p>
    );
  return (
    <div className="space-y-5">
      {groupMeetingPlans(plans, context.visits.data ?? []).map((group) => (
        <section key={group.key} className="space-y-3">
          <header className="flex items-center gap-3">
            <span className="size-3 shrink-0 rounded-full border border-dotted border-app-accent" />
            <h2 className="break-words text-base font-medium">
              {groupTitle(group, context, workspace)}
            </h2>
          </header>
          <div className="space-y-3">
            {group.plans.map((plan) => (
              <MeetingTimeline
                key={plan.id}
                {...{ plan, editor, state, workspace }}
                visits={context.visits.data ?? []}
                places={context.places.data ?? []}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MeetingTimeline(props: ComponentProps<typeof MeetingCard>): JSX.Element {
  return (
    <div className="flex gap-3">
      <div className="w-20 shrink-0 space-y-1 pt-4 text-xs text-muted-foreground">
        <p className="break-words">{props.plan.startDate ?? props.workspace.text('unknownDate')}</p>
        <p className="break-words">{props.plan.endDate ?? props.workspace.text('unknownDate')}</p>
      </div>
      <div className="relative min-w-0 flex-1 border-l border-dotted border-border pl-3">
        <span aria-hidden className="absolute -left-1 top-5 size-2 rounded-full bg-app-accent" />
        <MeetingCard {...props} />
      </div>
    </div>
  );
}

function groupTitle(
  group: PeopleGroup,
  context: PeopleSectionProps['context'],
  workspace: PeopleSectionProps['workspace']
): string {
  if (!group.visit)
    return group.visitId === null
      ? workspace.text('unassociated')
      : workspace.text('visitUnavailable', { id: group.visitId });
  const name =
    context.places.data?.find((place) => place.id === group.visit?.placeId)?.name ??
    workspace.text('placeUnavailable');
  return `${(context.visits.data ?? []).findIndex((visit) => visit.id === group.visitId) + 1}. ${name} · #${group.visit.id}`;
}
