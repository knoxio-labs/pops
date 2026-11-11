import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, ErrorState, PageHeader } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { loadCalendar } from './api';
import { CalendarControls } from './CalendarControls';
import { CalendarRows } from './CalendarRows';
import { CalendarWindowContext } from './CalendarWindowContext';
import { selectionProblem, visibleEntries } from './model';

import type { JSX } from 'react';

import type { CalendarSelection, CalendarSnapshot, CalendarWorkspaceProps } from './types';

/** Approved clock rail backed by complete owning source collections and authoritative journey timing. */
export function CalendarWorkspace(props: CalendarWorkspaceProps): JSX.Element {
  if (!Number.isSafeInteger(props.tripId) || props.tripId <= 0)
    return (
      <ErrorState
        error={{ code: 'trips.identity.invalid', message: 'Choose a valid trip', retryable: false }}
      />
    );
  return (
    <CalendarSession
      key={`${props.client?.getConfig().baseUrl ?? '/trips-api'}:${props.tripId}`}
      {...props}
    />
  );
}

function CalendarSession(props: CalendarWorkspaceProps): JSX.Element {
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
    <main className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <PageHeader
        title="Trip calendar"
        backHref="/trips"
        actions={
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={source.isFetching}
            onClick={() => void source.refetch()}
          >
            Refresh
          </Button>
        }
      />
      {source.isPending && <p role="status">Loading calendar…</p>}
      {source.isError && (
        <section aria-label="Calendar source unavailable">
          {source.data !== undefined && (
            <p role="status">Showing the last complete read. Sources may have changed.</p>
          )}
          <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
        </section>
      )}
      {source.data !== undefined && <CalendarContent snapshot={source.data} {...props} />}
    </main>
  );
}

function CalendarContent({
  snapshot,
  ...props
}: CalendarWorkspaceProps & { snapshot: CalendarSnapshot }): JSX.Element {
  const [selection, onChange] = useState<CalendarSelection>({
    from: '',
    to: '',
    zone: '',
    kind: 'all',
    journey: '',
  });
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
          {problems[problem]}
        </p>
      )}
      {!problem && <CalendarWindowContext snapshot={snapshot} selection={selection} />}
      {!problem && entries.length === 0 && <p role="status">No entries in this range</p>}
      {!problem && entries.length > 0 && (
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
const problems = {
  zone: 'Choose a valid display time zone',
  range: 'Choose a valid date range with the end on or after the start',
  window: 'This journey window is unavailable. Choose another journey or all dates.',
};
