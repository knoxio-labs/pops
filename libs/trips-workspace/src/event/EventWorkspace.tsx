import { RotateCcw } from 'lucide-react';

import { Button, ErrorState, PageHeader } from '@pops/ui';

import { SourceConflict } from '../shared/SourceConflict';
import { SourceDocuments } from '../shared/SourceDocuments';
import { useSourceQuery } from '../shared/use-source-query';
import { loadPlaces, loadTrip, loadVisits, requestProblem } from '../stay/api';
import { eventQueryKey, loadEvent } from './api';
import { EventSourceFacts } from './EventSourceFacts';
import { useEventEditor } from './use-event-editor';

import type { UseQueryResult } from '@tanstack/react-query';
import type { JSX } from 'react';

import type { Trip, Visit, Place } from '../stay/types';
import type { EventWorkspaceProps, TripEvent } from './types';
import type { EventEditor } from './use-event-editor';

/** Approved source-backed event editor inside its associated visit and neighbouring route visits. */
export function EventWorkspace(props: EventWorkspaceProps): JSX.Element {
  if (![props.tripId, props.eventId].every((id) => Number.isSafeInteger(id) && id > 0))
    return (
      <ErrorState
        error={{
          code: 'trips.identity.invalid',
          message: 'Choose a valid trip and event',
          retryable: false,
        }}
      />
    );
  return (
    <LoadEvent
      key={`${props.client?.getConfig().baseUrl ?? '/trips-api'}:${props.tripId}:${props.eventId}`}
      {...props}
    />
  );
}

function LoadEvent(props: EventWorkspaceProps): JSX.Element {
  const source = useSourceQuery(
    { client: props.client, tripId: props.tripId, kind: 'event', sourceId: props.eventId },
    (owner) => {
      const captured = { client: owner.client, tripId: owner.tripId, eventId: owner.sourceId };
      return { queryKey: eventQueryKey(captured), load: () => loadEvent(captured) };
    }
  );
  const context = useEventContext(props);
  if (source.ownershipError) return <ErrorState error={source.ownershipError} />;
  if (source.isPending)
    return (
      <p role="status" className="p-6">
        Loading event…
      </p>
    );
  if (source.data === undefined)
    return (
      <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
    );
  return (
    <>
      {source.isError && (
        <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
      )}
      <EventSession initial={source.data} identity={props} context={context} />
    </>
  );
}

interface EventContext {
  trip: UseQueryResult<Trip, Error>;
  visits: UseQueryResult<Visit[], Error>;
  places: UseQueryResult<Place[], Error>;
}
function useEventContext({ tripId, client }: EventWorkspaceProps): EventContext {
  const trip = useSourceQuery({ client, tripId, kind: 'trip-context', sourceId: 0 }, (owner) => {
    const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
    return {
      queryKey: ['trips', origin, owner.tripId],
      load: () => loadTrip(owner.tripId, owner.client),
    };
  });
  const visits = useSourceQuery(
    { client, tripId, kind: 'visits-context', sourceId: 0 },
    (owner) => {
      const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
      return {
        queryKey: ['trips', origin, owner.tripId, 'visits'],
        load: () => loadVisits(owner.tripId, owner.client),
      };
    }
  );
  const places = useSourceQuery(
    { client, tripId, kind: 'places-context', sourceId: 0 },
    (owner) => {
      const origin = owner.client.getConfig().baseUrl ?? '/trips-api';
      return { queryKey: ['trips', origin, 'places'], load: () => loadPlaces(owner.client) };
    }
  );
  return { trip, visits, places };
}

function EventSession({
  initial,
  identity,
  context,
}: {
  initial: TripEvent;
  identity: EventWorkspaceProps;
  context: ReturnType<typeof useEventContext>;
}): JSX.Element {
  const editor = useEventEditor(initial, identity);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <PageHeader
        title={editor.draft.name ?? 'Event detail'}
        backHref="/trips"
        breadcrumbs={[
          { label: 'Trips', href: '/trips' },
          { label: context.trip.data?.name ?? `Trip ${identity.tripId}` },
          { label: 'Event' },
        ]}
        actions={
          <Button
            className="min-h-11"
            variant="ghost"
            disabled={!editor.canUndo}
            onClick={() => void editor.undo()}
          >
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        }
      />
      <EditorStatus editor={editor} context={context} />
      <EventSourceFacts
        editor={editor}
        identity={identity}
        visits={context.visits.data ?? []}
        places={context.places.data ?? []}
      />
      <SourceDocuments
        tripId={identity.tripId}
        target={{ kind: 'event', id: identity.eventId }}
        tripsClient={identity.client}
        documentsClient={identity.documentsClient}
      />
    </main>
  );
}

function ContextProblems({ context }: { context: EventContext }): JSX.Element {
  return (
    <>
      {Object.entries(context)
        .filter(([, query]) => query.isError)
        .map(([name, query]) => (
          <section key={name} aria-label={`${name} context unavailable`}>
            <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
          </section>
        ))}
    </>
  );
}
function saveStatus(busy: boolean, failed: boolean, dirty: boolean): string {
  if (busy) return 'Saving…';
  if (failed) return 'Changes have not been saved';
  return dirty ? 'Unsaved changes' : 'Changes saved';
}

function EditorStatus({
  editor,
  context,
}: {
  editor: EventEditor;
  context: EventContext;
}): JSX.Element {
  return (
    <>
      <SourceConflict conflict={editor.conflict} reset={editor.reset} />
      {editor.failure && (
        <ErrorState
          error={requestProblem(editor.failure.error)}
          onRetry={editor.conflict ? undefined : () => void editor.retry()}
        />
      )}
      <ContextProblems context={context} />
      <p role="status" className="text-sm text-muted-foreground">
        {saveStatus(editor.busy, editor.failure !== undefined, editor.dirty)}
      </p>
    </>
  );
}
