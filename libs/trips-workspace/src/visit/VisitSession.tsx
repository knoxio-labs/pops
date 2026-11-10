import { RotateCcw } from 'lucide-react';

import { Button, ErrorState, PageHeader, Select } from '@pops/ui';

import { SourceReferences } from '../journey/SourceReferences';
import { requestProblem } from '../stay/api';
import { useVisitEditor } from './use-visit-editor';
import { VisitFields } from './VisitFields';
import { VisitFindings } from './VisitFindings';
import { VisitPlaceCapture } from './VisitPlaceCapture';
import { VisitTimeline } from './VisitTimeline';

import type { JSX } from 'react';

import type { Visit, VisitWorkspaceProps } from './types';
import type { VisitContext } from './use-visit-context';
import type { VisitEditor } from './use-visit-editor';

/** Source editing session remounted only at explicit identity/origin boundaries or canonical reload. */
export function VisitSession({
  initial,
  identity,
  context,
  reload,
}: {
  initial: Visit;
  identity: VisitWorkspaceProps;
  context: VisitContext;
  reload: () => Promise<void>;
}): JSX.Element {
  const editor = useVisitEditor(initial, identity);
  const visit = editor.draft;
  return (
    <main className="mx-auto max-w-5xl space-y-3 p-4 md:p-6">
      <VisitHeader identity={identity} editor={editor} context={context} />
      <VisitStatus context={context} editor={editor} reload={reload} />
      <fieldset
        disabled={editor.busy}
        className="min-w-0 rounded-xl border border-app-accent/30 bg-app-accent/10 p-3"
      >
        <legend className="sr-only">Visit source facts</legend>
        <VisitFields
          visit={visit}
          places={context.places.data ?? []}
          edit={editor.edit}
          commit={editor.commit}
        />
        {visit.sourceLinks.length > 0 && (
          <SourceReferences
            links={visit.sourceLinks}
            save={(sourceLinks) => void editor.commit({ sourceLinks })}
          />
        )}
        <VisitPlaceCapture
          identity={identity}
          commit={editor.commit}
          selectedPlaceId={editor.saved.placeId}
          reload={() => context.places.refetch()}
        />
      </fieldset>
      <VisitFindings visit={visit} stays={context.stays.data ?? []} />
      <VisitTimeline
        visit={visit}
        stays={context.stays.data ?? []}
        events={context.events.data ?? []}
        identity={identity}
        accommodationAvailable={context.stays.data !== undefined}
      />
    </main>
  );
}
function VisitHeader({
  identity,
  editor,
  context,
}: {
  identity: VisitWorkspaceProps;
  editor: VisitEditor;
  context: VisitContext;
}): JSX.Element {
  const place = context.places.data?.find((item) => item.id === editor.draft.placeId);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          className="min-w-0 break-words"
          title={place?.name ?? 'Visit'}
          description={context.trip.data?.name ?? undefined}
        />
        <Button
          variant="ghost"
          disabled={!editor.canUndo || editor.dirty}
          onClick={() => void editor.undo()}
        >
          <RotateCcw className="size-4" aria-hidden />
          Undo
        </Button>
      </div>
      {identity.onViewVisit && (
        <Select
          label="Visit"
          value={String(identity.visitId)}
          className="min-h-11"
          options={(context.visits.data ?? [editor.draft]).map((item, index) => ({
            value: String(item.id),
            label: `${index + 1} · ${context.places.data?.find((candidate) => candidate.id === item.placeId)?.name ?? 'City unavailable'}`,
          }))}
          onChange={(event) => {
            const next = context.visits.data?.find(
              (item) => String(item.id) === event.currentTarget.value
            );
            if (next) identity.onViewVisit?.(next.id);
          }}
        />
      )}
    </>
  );
}
function VisitStatus({
  context,
  editor,
  reload,
}: {
  context: VisitContext;
  editor: VisitEditor;
  reload: () => Promise<void>;
}): JSX.Element {
  const problems = Object.entries(context).filter(([, query]) => query.isError);
  return (
    <>
      {editor.failure && (
        <div className="space-y-2">
          <ErrorState
            error={requestProblem(editor.failure.error)}
            onRetry={() => void editor.retry()}
          />
          <Button variant="ghost" onClick={() => void reload()}>
            Reload visit
          </Button>
        </div>
      )}
      {problems.length > 0 && (
        <section aria-label="Visit context unavailable">
          {problems.map(([key, query]) => (
            <ErrorState
              key={key}
              error={requestProblem(query.error)}
              onRetry={() => void query.refetch()}
            />
          ))}
        </section>
      )}
      <p role="status" className="text-xs text-muted-foreground">
        {saveStatus(editor)}
      </p>
    </>
  );
}
function saveStatus(editor: VisitEditor): string {
  if (editor.busy) return 'Saving…';
  if (editor.failure) return 'Changes have not been saved';
  return editor.dirty ? 'Unsaved changes' : 'Changes saved';
}
