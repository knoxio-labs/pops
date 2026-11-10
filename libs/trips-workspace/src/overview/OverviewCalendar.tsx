import { useQuery } from '@tanstack/react-query';

import { ErrorState } from '@pops/ui';

import { loadCalendar } from '../calendar/api';
import { CalendarControls } from '../calendar/CalendarControls';
import { CalendarRows } from '../calendar/CalendarRows';
import { selectionProblem, visibleEntries } from '../calendar/model';
import { requestProblem } from '../stay/api';

import type { JSX } from 'react';

import type { CalendarSnapshot } from '../calendar/types';
import type { TripOverviewProps, OverviewCalendarControl } from './types';

type CalendarProps = TripOverviewProps & { calendar: OverviewCalendarControl };

/** The existing Calendar projection inside its owning Timeline, with host-controlled explicit filters. */
export function OverviewCalendar(props: CalendarProps): JSX.Element {
  const source = useQuery({
    queryKey: [
      'trips',
      props.client?.getConfig().baseUrl ?? '/trips-api',
      props.tripId,
      'calendar',
    ],
    queryFn: ({ signal }) => loadCalendar(props, signal),
    retry: false,
  });
  return (
    <section aria-label={props.labels.status('calendar')} className="space-y-4">
      {source.isPending && <p role="status">{props.labels.loading}</p>}
      {source.isError && (
        <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
      )}
      {source.data && <CalendarProjection {...props} snapshot={source.data} />}
    </section>
  );
}

function CalendarProjection(props: CalendarProps & { snapshot: CalendarSnapshot }): JSX.Element {
  const {
    snapshot,
    calendar: { selection, onChange },
  } = props;
  const problem = selectionProblem(selection, snapshot);
  const entries = visibleEntries(snapshot, selection);
  return (
    <>
      <CalendarControls snapshot={snapshot} selection={selection} onChange={onChange} />
      {problem && (
        <p
          role={problem === 'zone' && !selection.zone ? 'status' : 'alert'}
          className="text-sm text-destructive"
        >
          {props.labels.status(`calendar.${problem}`)}
        </p>
      )}
      {!problem && entries.length === 0 && (
        <p role="status">{props.labels.status('calendar.empty')}</p>
      )}
      {!problem && (
        <CalendarRows
          entries={entries}
          zone={selection.zone}
          locale={props.locale}
          onOpenSource={props.onOpenSource}
        />
      )}
    </>
  );
}
