import { skipToken, useQueries } from '@tanstack/react-query';
import { useState } from 'react';

import { arrangementsKey } from '../arrangements/api';
import { OverviewCalendar } from './OverviewCalendar';
import { OverviewDetached } from './OverviewDetached';
import { OverviewHeader } from './OverviewHeader';
import { OverviewReferences } from './OverviewReferences';
import { OverviewRoute } from './OverviewRoute';
import { workspacePeople } from './workspace-people-model';
import { workspaceTextMatches } from './workspace-projection';
import { WorkspaceAttention } from './WorkspaceAttention';
import { WorkspaceControls } from './WorkspaceControls';
import { WorkspaceCoverage } from './WorkspaceCoverage';
import { WorkspacePeople } from './WorkspacePeople';

import type { JSX } from 'react';

import type { OverviewDisplay, OverviewFilter, OverviewViewProps } from './types';

/** Present one searchable, filterable workspace around the selected Trip's canonical Timeline. */
export function OverviewContent(props: OverviewViewProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [display, setDisplay] = useState<OverviewDisplay>('sheet');
  const [filter, setFilter] = useState<OverviewFilter>('everything');
  const people = workspacePeople(props);
  const reader = props.responsibility?.contacts?.readContactReference;
  const contactReads = useQueries({
    queries: people.map(({ uri }) => ({
      queryKey: [...arrangementsKey(props), 'contact-reference', uri],
      queryFn: reader ? ({ signal }) => reader(uri, { signal }) : skipToken,
      retry: false,
    })),
  });
  const workspaceContactNames = new Map<string, string>();
  for (const [index, person] of people.entries()) {
    const result = contactReads[index]?.data;
    if (result?.status === 'available') workspaceContactNames.set(person.uri, result.name);
  }
  const workspaceProps = workspaceViewProps(
    { ...props, workspaceContactNames },
    query,
    display,
    filter
  );
  return (
    <>
      <OverviewHeader {...props} />
      <WorkspaceCoverage {...props} />
      {props.captureComposer}
      <WorkspaceControls
        labels={props.labels}
        query={query}
        onQueryChange={setQuery}
        display={display}
        onDisplayChange={setDisplay}
        filter={filter}
        onFilterChange={setFilter}
      />
      <WorkspaceFilters {...props} />
      {workspaceProps.calendar && (
        <OverviewCalendar {...workspaceProps} calendar={workspaceProps.calendar} />
      )}
      <WorkspaceBody {...workspaceProps} filter={filter} />
    </>
  );
}

function workspaceViewProps(
  props: OverviewViewProps,
  query: string,
  display: OverviewDisplay,
  filter: OverviewFilter
): OverviewViewProps {
  const state = { workspaceQuery: query, workspaceDisplay: display, workspaceFilter: filter };
  return props.calendar
    ? { ...props, ...state, calendar: props.calendar, onOpenSource: props.onOpenSource }
    : { ...props, ...state, calendar: undefined };
}

function WorkspaceFilters(props: OverviewViewProps): JSX.Element | null {
  return props.sourceControls ? (
    <details className="rounded-xl border border-trip-line bg-trip-surface px-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-trip-muted">
        {props.labels.status('workspace.moreFilters')}
      </summary>
      <div className="pb-4">{props.sourceControls}</div>
    </details>
  ) : null;
}

function WorkspaceBody(props: OverviewViewProps & { filter: OverviewFilter }): JSX.Element {
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-12 xl:items-start">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <OverviewRoute {...props} />
        <OverviewDetached {...props} />
        {props.trip.notes &&
          (props.filter === 'everything' || workspaceTextMatches(props, [props.trip.notes])) && (
            <section className="rounded-2xl border border-trip-line bg-trip-surface p-4 sm:p-5">
              <h2 className="font-trip-display text-lg font-semibold">{props.labels.notes}</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-trip-muted">
                {props.trip.notes}
              </p>
            </section>
          )}
      </div>
      <aside className="min-w-0 space-y-5 xl:sticky xl:top-6 xl:col-span-4">
        <WorkspaceAttention {...props} />
        <WorkspacePeople {...props} />
        <OverviewReferences {...props} />
      </aside>
    </div>
  );
}
