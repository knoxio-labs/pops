import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';

import { Button, ErrorState, PageHeader } from '@pops/ui';

import { loadStay, requestProblem } from './api';
import { StayFields } from './StayFields';
import { StayReferences } from './StayReferences';
import { StayTimeline } from './StayTimeline';
import { useStayContext } from './use-stay-context';
import { useStayEditor } from './use-stay-editor';

import type { Stay, StayWorkspaceProps } from './types';

/** Source-backed approved In visit workspace; the host supplies its authenticated query/client context. */
export function StayWorkspace(props: StayWorkspaceProps) {
  if (![props.tripId, props.stayId].every((value) => Number.isSafeInteger(value) && value > 0))
    return (
      <ErrorState
        error={{
          code: 'trips.identity.invalid',
          message: 'Choose a valid trip and stay',
          retryable: false,
        }}
      />
    );
  return <LoadStay key={`${props.tripId}:${props.stayId}`} {...props} />;
}

function LoadStay(props: StayWorkspaceProps) {
  const origin = props.client?.getConfig().baseUrl ?? '/trips-api';
  const context = useStayContext(props);
  const source = useQuery({
    queryKey: ['trips', origin, props.tripId, 'stay', props.stayId],
    queryFn: () => loadStay(props),
    retry: false,
  });
  if (source.isPending)
    return (
      <p role="status" className="p-6">
        Loading stay…
      </p>
    );
  if (source.isError)
    return (
      <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
    );
  return <StaySession initial={source.data} identity={props} context={context} />;
}

function StaySession({
  initial,
  identity,
  context,
}: {
  initial: Stay;
  identity: StayWorkspaceProps;
  context: ReturnType<typeof useStayContext>;
}) {
  const editor = useStayEditor(initial, identity);
  const visit = context.visits.data?.find((candidate) => candidate.id === editor.draft.visitId);
  const place = context.places.data?.find((candidate) => candidate.id === visit?.placeId);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <PageHeader
        title={place?.name ?? 'Stay detail'}
        description={context.trip.data?.name ?? undefined}
        actions={
          <Button variant="ghost" disabled={!editor.canUndo} onClick={() => void editor.undo()}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        }
      />
      {editor.failure && (
        <ErrorState
          error={requestProblem(editor.failure.error)}
          onRetry={() => void editor.retry()}
        />
      )}
      <ContextProblems context={context} />
      <p role="status" className="text-sm text-muted-foreground">
        {saveStatus(editor.busy, editor.failure !== undefined, editor.dirty)}
      </p>
      <fieldset disabled={editor.busy} className="min-w-0 space-y-4">
        <legend className="sr-only">Stay source facts</legend>
        <StayTimeline stay={editor.draft} stays={context.stays.data ?? []}>
          <StayFields
            stay={editor.draft}
            visits={context.visits.data ?? []}
            places={context.places.data ?? []}
            edit={editor.edit}
            commit={(patch) => void editor.commit(patch)}
          />
          <StayReferences stay={editor.draft} commit={(patch) => void editor.commit(patch)} />
        </StayTimeline>
      </fieldset>
    </main>
  );
}

function ContextProblems({ context }: { context: ReturnType<typeof useStayContext> }) {
  const problems = Object.entries(context).filter(([, query]) => query.isError);
  if (problems.length === 0) return null;
  return (
    <section aria-label="Visit context unavailable">
      <h2 className="text-sm font-medium">Some visit context could not be loaded</h2>
      {problems.map(([key, query]) => (
        <ErrorState
          key={key}
          error={requestProblem(query.error)}
          onRetry={() => void query.refetch()}
        />
      ))}
    </section>
  );
}

function saveStatus(busy: boolean, failed: boolean, dirty: boolean) {
  if (busy) return 'Saving…';
  if (failed) return 'Changes have not been saved';
  return dirty ? 'Unsaved changes' : 'Changes saved';
}
