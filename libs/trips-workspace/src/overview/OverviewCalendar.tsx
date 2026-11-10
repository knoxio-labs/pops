import { ErrorState } from '@pops/ui';

import { loadCalendar } from '../calendar/api';
import { CalendarControls } from '../calendar/CalendarControls';
import { CalendarRows } from '../calendar/CalendarRows';
import { selectionProblem, visibleEntries } from '../calendar/model';
import { assertSourceOwner } from '../shared/retained-session-store';
import { useSourceQuery } from '../shared/use-source-query';
import { requestProblem } from '../stay/api';
import { readOverviewSource } from './source-read';

import type { JSX } from 'react';

import type { CalendarSnapshot } from '../calendar/types';
import type { TripOverviewProps, OverviewCalendarControl } from './types';

type CalendarProps = TripOverviewProps & { calendar: OverviewCalendarControl };

/** The existing Calendar projection inside its owning Timeline, with host-controlled explicit filters. */
export function OverviewCalendar(props: CalendarProps): JSX.Element {
  const source = useSourceQuery({ ...props, kind: 'overview-calendar', sourceId: 0 }, (owner) => ({
    queryKey: ['trips', owner.client.getConfig().baseUrl ?? '/trips-api', owner.tripId, 'calendar'],
    load: ({ signal }) =>
      readOverviewSource(owner, () =>
        loadCalendar({ tripId: owner.tripId, client: owner.client }, signal, () =>
          assertSourceOwner(owner)
        )
      ),
  }));
  if (source.ownershipError) return <ErrorState error={source.ownershipError} />;
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
