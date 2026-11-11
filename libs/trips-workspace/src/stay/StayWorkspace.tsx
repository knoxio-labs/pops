import { RotateCcw } from 'lucide-react';

import { Button, ErrorState, PageHeader } from '@pops/ui';

import { SourceConflict } from '../shared/SourceConflict';
import { SourceDocuments } from '../shared/SourceDocuments';
import { useSourceQuery } from '../shared/use-source-query';
import { loadStay, requestProblem, stayQueryKey } from './api';
import { StaySourceFacts } from './StaySourceFacts';
import { useStayContext } from './use-stay-context';
import { useStayEditor } from './use-stay-editor';

import type { JSX } from 'react';

import type { Stay, StayWorkspaceProps } from './types';

/** Source-backed approved In visit workspace; the host supplies its authenticated query/client context. */
export function StayWorkspace(props: StayWorkspaceProps): JSX.Element {
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
  return (
    <LoadStay
      key={`${props.client?.getConfig().baseUrl ?? '/trips-api'}:${props.tripId}:${props.stayId}`}
      {...props}
    />
  );
}

function LoadStay(props: StayWorkspaceProps): JSX.Element {
  const context = useStayContext(props);
  const source = useSourceQuery(
    { client: props.client, tripId: props.tripId, kind: 'stay', sourceId: props.stayId },
    (owner) => {
      const captured = { client: owner.client, tripId: owner.tripId, stayId: owner.sourceId };
      return { queryKey: stayQueryKey(captured), load: () => loadStay(captured) };
    }
  );
  if (source.ownershipError) return <ErrorState error={source.ownershipError} />;
  if (source.isPending)
    return (
      <p role="status" className="p-6">
        Loading stay…
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
      <StaySession
        key={source.owner.origin}
        initial={source.data}
        identity={props}
        context={context}
      />
    </>
  );
}

function StaySession({
  initial,
  identity,
  context,
}: {
  initial: Stay;
  identity: StayWorkspaceProps;
  context: ReturnType<typeof useStayContext>;
}): JSX.Element {
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
      <StaySourceFacts editor={editor} identity={identity} context={context} />
      <SourceDocuments
        tripId={identity.tripId}
        target={{ kind: 'stay', id: identity.stayId }}
        tripsClient={identity.client}
        documentsClient={identity.documentsClient}
      />
    </main>
  );
}

function ContextProblems({
  context,
}: {
  context: ReturnType<typeof useStayContext>;
}): JSX.Element | null {
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

function saveStatus(
  busy: boolean,
  failed: boolean,
  dirty: boolean
): 'Saving…' | 'Changes have not been saved' | 'Unsaved changes' | 'Changes saved' {
  if (busy) return 'Saving…';
  if (failed) return 'Changes have not been saved';
  return dirty ? 'Unsaved changes' : 'Changes saved';
}
