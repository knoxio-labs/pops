import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw } from 'lucide-react';

import { Button, ErrorState, PageHeader, SortableGrid } from '@pops/ui';

import { loadPlaces, requestProblem } from '../stay/api';
import { journeyKey, loadJourney, loadTiming } from './api';
import { JourneyChronology } from './JourneyChronology';
import { JourneyLegCard } from './JourneyLegCard';
import { JourneyMetadata } from './JourneyMetadata';
import { JourneyWriteFailure } from './JourneyWriteFailure';
import { useJourneyEditor } from './use-journey-editor';

import type { JSX } from 'react';

import type { Place } from '../stay/types';
import type { JourneyWorkspaceProps, JourneySource } from './types';
import type { JourneyEditor } from './use-journey-editor';

/** Independently editable source record, also used for expanded alternatives without recursive grouping UI. */
export function JourneyRecord(props: JourneyWorkspaceProps): JSX.Element {
  const source = useQuery({
    queryKey: journeyKey(props),
    queryFn: () => loadJourney(props),
    retry: false,
  });
  if (source.isPending)
    return (
      <p role="status" className="p-4">
        Loading journey…
      </p>
    );
  if (!source.data)
    return (
      <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
    );
  return (
    <>
      {source.isError && (
        <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
      )}
      <JourneySession
        key={`${props.tripId}:${props.journeyId}`}
        initial={source.data}
        identity={props}
        reload={async () => (await source.refetch()).isSuccess}
      />
    </>
  );
}

function JourneySession({
  initial,
  identity,
  reload,
}: {
  initial: JourneySource;
  identity: JourneyWorkspaceProps;
  reload: () => Promise<boolean>;
}): JSX.Element {
  const editor = useJourneyEditor(initial, identity);
  const timing = useQuery({
    queryKey: [...journeyKey(identity), 'timing'],
    queryFn: () => loadTiming(identity),
    retry: false,
  });
  const places = useQuery({
    queryKey: ['trips', identity.client?.getConfig().baseUrl ?? '/trips-api', 'places'],
    queryFn: () => loadPlaces(identity.client),
    retry: false,
  });
  return (
    <section aria-label="Journey source editor" className="space-y-4">
      <PageHeader
        title={editor.draft.journey.name?.trim() || 'Journey detail'}
        actions={
          <Button variant="ghost" disabled={!editor.canUndo} onClick={editor.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        }
      />
      <JourneyWriteFailure editor={editor} reload={reload} />
      {timing.isError && (
        <ErrorState error={requestProblem(timing.error)} onRetry={() => void timing.refetch()} />
      )}
      {places.isError && (
        <ErrorState error={requestProblem(places.error)} onRetry={() => void places.refetch()} />
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {saveStatus(editor)}
      </p>
      <JourneyChronology timing={timing.data} />
      <JourneyFields editor={editor} places={places.data ?? []} />
    </section>
  );
}

function JourneyFields({
  editor,
  places,
}: {
  editor: JourneyEditor;
  places: Place[];
}): JSX.Element {
  return (
    <fieldset disabled={editor.busy || editor.failure !== undefined} className="min-w-0 space-y-4">
      <legend className="sr-only">Journey source facts</legend>
      {editor.draft.legs.length === 0 && (
        <p className="text-sm text-muted-foreground">No transport legs recorded</p>
      )}
      <SortableGrid
        items={editor.draft.legs}
        getKey={(leg) => leg.id}
        columnsClassName="grid-cols-1"
        disabled={editor.busy || editor.failure !== undefined}
        onReorder={(legs) => void editor.run({ kind: 'order', ids: legs.map((leg) => leg.id) })}
        renderItem={(leg, index) => (
          <JourneyLegCard leg={leg} index={index} editor={editor} places={places} />
        )}
      />
      <Button variant="ghost" onClick={() => void editor.run({ kind: 'create', patch: {} })}>
        <Plus className="size-4" aria-hidden />
        Add transport
      </Button>
      <JourneyMetadata editor={editor} />
    </fieldset>
  );
}

function saveStatus(editor: JourneyEditor): string {
  if (editor.busy) return 'Saving…';
  if (editor.failure) return 'Changes have not been saved';
  return editor.dirty ? 'Unsaved changes' : 'Changes saved';
}
