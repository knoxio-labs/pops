import { useEffect } from 'react';

import { Button, ErrorState, Select } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { useInboxContactReads } from './CaptureInbox';
import { CaptureSessionBoundary } from './CaptureSessionBoundary';
import { projectExploreRows, projectExploreSource } from './explore-model';
import {
  captureTimelineSourceVisible,
  projectCaptureTimeline,
  timelineLocationOptions,
} from './timeline-filters';
import { useCaptureContext } from './use-capture-context';
import { useCaptureEditor } from './use-capture-editor';

import type { JSX } from 'react';

import type { CaptureSessionView } from './CaptureSessionBoundary';
import type {
  CaptureTimelineSelection,
  CaptureTimelineSource,
  CaptureTimelineVisibility,
} from './timeline-filters';
import type { CaptureWorkspaceProps } from './types';

/** Host-translated labels for the existing organisation, source-kind and literal-location filters. */
export type CaptureTimelineFilterLabel =
  | 'organisation'
  | 'kind'
  | 'location'
  | 'all'
  | 'unassigned'
  | 'unavailable'
  | CaptureTimelineSource['kind']
  | Exclude<CaptureTimelineSelection['organisation'], 'all'>;
/** Controlled filters never create a collection, infer an association or alter canonical records. */
export interface CaptureTimelineFiltersProps extends Pick<
  CaptureWorkspaceProps,
  'tripId' | 'client' | 'contacts'
> {
  selection: CaptureTimelineSelection;
  onChange: (selection: CaptureTimelineSelection) => void;
  onVisibility: (visibility: CaptureTimelineVisibility) => void;
  onOpenSource: (source: CaptureTimelineSource) => void;
  label: (key: CaptureTimelineFilterLabel) => string;
  referenceLabel: (kind: string, id: number) => string;
}

/** Inline Timeline controls reuse Capture's owner-fenced reads and show unavailable memberships by exact identity. */
export function CaptureTimelineFilters(props: CaptureTimelineFiltersProps): JSX.Element {
  return (
    <CaptureSessionBoundary {...props}>
      {(view) => <Filters {...props} {...view} />}
    </CaptureSessionBoundary>
  );
}

function Filters({
  session,
  query,
  scope,
  ...props
}: CaptureTimelineFiltersProps & CaptureSessionView): JSX.Element {
  const state = useCaptureEditor(session, props, query.data, scope.key);
  const context = useCaptureContext(props, scope);
  useInboxContactReads(session, state.source);
  const { onVisibility, tripId, selection } = props;
  const places = context.places.data;
  const visits = context.visits.data;
  const visibility = projectCaptureTimeline(state.source, tripId, selection, {
    places: places ?? [],
    visits: visits ?? [],
    contactAvailability: session.contactReads.availability,
  });
  useEffect(() => {
    const publish = (): void =>
      onVisibility(
        projectCaptureTimeline(state.source, tripId, selection, {
          places: places ?? [],
          visits: visits ?? [],
          contactAvailability: session.contactReads.availability,
        })
      );
    publish();
    return session.contactReads.subscribe(publish);
  }, [onVisibility, state.source, tripId, selection, places, visits, session]);
  const locations = visibility.known.map((key) =>
    projectExploreSource(state.source, places ?? [], visits ?? [], key)
  );
  const unavailable = projectExploreRows(state.source, places ?? [], visits ?? []).filter(
    (row) => row.unavailable && captureTimelineSourceVisible(visibility, row.source)
  );
  return (
    <FilterContent
      {...props}
      query={query}
      context={context}
      locations={locations}
      unavailable={unavailable}
    />
  );
}

function FilterContent(
  props: CaptureTimelineFiltersProps & {
    query: CaptureSessionView['query'];
    context: ReturnType<typeof useCaptureContext>;
    locations: ReturnType<typeof projectExploreSource>[];
    unavailable: ReturnType<typeof projectExploreRows>;
  }
): JSX.Element {
  const { query, context, unavailable } = props;
  return (
    <section aria-label={props.label('kind')} className="space-y-3">
      {query.isError && (
        <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
      )}
      {Object.entries(context).map(
        ([key, value]) =>
          value.isError && (
            <section key={key} aria-label={`${key} unavailable`}>
              <ErrorState
                error={requestProblem(value.error)}
                onRetry={() => void value.refetch()}
              />
            </section>
          )
      )}
      <FilterFields {...props} />
      {unavailable.map((row) => (
        <article key={row.membershipId} className="rounded-lg border border-border p-4">
          <p role="status">
            {props.referenceLabel(row.source.kind, row.source.id)} · {props.label('unavailable')}
          </p>
          <Button variant="outline" onClick={() => props.onOpenSource(row.source)}>
            {props.referenceLabel(row.source.kind, row.source.id)}
          </Button>
        </article>
      ))}
    </section>
  );
}

function FilterFields(
  props: CaptureTimelineFiltersProps & {
    locations: ReturnType<typeof projectExploreSource>[];
  }
): JSX.Element {
  const { selection, onChange, label } = props;
  const kinds = ['all', 'capture', 'idea', 'event'] as const;
  const organisations = ['all', 'unorganised', 'organised', 'unresolved', 'unverified'] as const;
  const locations = timelineLocationOptions(
    props.locations,
    selection.location,
    label,
    props.referenceLabel
  );
  const locationValue =
    typeof selection.location === 'string'
      ? selection.location
      : JSON.stringify(selection.location);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select
        label={label('organisation')}
        value={selection.organisation}
        options={organisations.map((value) => ({ value, label: label(value) }))}
        onChange={(event) => {
          const organisation = organisations.find((value) => value === event.target.value);
          if (organisation) onChange({ ...selection, organisation });
        }}
      />
      <Select
        label={label('kind')}
        value={selection.kind}
        options={kinds.map((value) => ({ value, label: label(value) }))}
        onChange={(event) => {
          const kind = kinds.find((value) => value === event.target.value);
          if (kind) onChange({ ...selection, kind });
        }}
      />
      <Select
        label={label('location')}
        value={locationValue}
        options={[...locations].map(([value, option]) => ({ value, label: option.label }))}
        onChange={(event) => {
          const location = locations.get(event.target.value)?.value;
          if (location !== undefined) onChange({ ...selection, location });
        }}
      />
    </div>
  );
}
