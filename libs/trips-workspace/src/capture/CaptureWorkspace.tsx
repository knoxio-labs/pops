import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { Button, ErrorState } from '@pops/ui';

import { sourceOwner } from '../arrangements/source-owner';
import { requestProblem } from '../stay/api';
import { captureQueryKey, performCaptureRequest } from './api';
import { findCaptureSessionForOwner, retainCaptureSession } from './browser-session';
import { CaptureComposer } from './CaptureComposer';
import { CaptureContactChooser } from './CaptureContactChooser';
import { CaptureExplore } from './CaptureExplore';
import { CaptureInbox } from './CaptureInbox';
import { CaptureSelectedSource } from './CaptureSelectedSource';
import { useCaptureContext } from './use-capture-context';
import { useCaptureEditor } from './use-capture-editor';
import { CaptureWorkspaceReadScope } from './workspace-read';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureEditorState } from './editor-types';
import type { CaptureWorkspaceProps } from './types';
import type { CaptureWorkspaceRead } from './workspace-read';

/** Contextual Capture tools retain one owning-trip composer and command history across view remounts. */
export function CaptureWorkspace(props: CaptureWorkspaceProps): JSX.Element {
  if (!Number.isSafeInteger(props.tripId) || props.tripId < 1)
    return (
      <ErrorState
        error={{ code: 'trips.identity.invalid', message: 'Choose a valid trip', retryable: false }}
      />
    );
  return <LoadWorkspace key={JSON.stringify(captureQueryKey(props))} {...props} />;
}
function LoadWorkspace(props: CaptureWorkspaceProps): JSX.Element {
  const cache = useQueryClient();
  const [scope] = useState(() => new CaptureWorkspaceReadScope(props));
  const { client, origin, tripId } = sourceOwner(props);
  const currentOwner = useMemo(
    () => Object.freeze({ client, origin, tripId }),
    [client, origin, tripId]
  );
  const select = useCallback(
    (read: CaptureWorkspaceRead) => scope.select(currentOwner, read),
    [scope, currentOwner]
  );
  const retained = findCaptureSessionForOwner(cache, scope.owner.captured);
  const query = useQuery({
    queryKey: scope.key,
    retry: false,
    queryFn: ({ signal }) => scope.load(cache, props, signal),
    select,
  });
  if (retained === undefined && query.data === undefined)
    return query.isError ? (
      <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
    ) : (
      <p role="status" className="p-6">
        Loading source…
      </p>
    );
  const session =
    retained ??
    (query.data &&
      retainCaptureSession(cache, props, query.data.source, {
        perform: (request) => performCaptureRequest(props, request),
        contacts: props.contacts,
      }));
  if (!session) throw new Error('Missing source session');
  return <WorkspaceSession session={session} query={query} scope={scope} {...props} />;
}
function WorkspaceSession({
  session,
  query,
  scope,
  ...props
}: CaptureWorkspaceProps & {
  session: CaptureBrowserSession;
  query: ReturnType<typeof useQuery<CaptureWorkspaceRead>>;
  scope: CaptureWorkspaceReadScope;
}): JSX.Element {
  const state = useCaptureEditor(session, props, query.data, scope.key);
  const context = useCaptureContext(props);
  return (
    <section aria-label="Capture tools" className="space-y-5">
      <WorkspaceHeader session={session} view={props.view} state={state} />
      <CaptureContactChooser session={session} />
      {query.isError ? (
        <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      <OperationProblem session={session} />
      {Object.entries(context)
        .filter(([, value]) => value.isError)
        .map(([key, value]) => (
          <section aria-label={`${key} unavailable`} key={key}>
            <ErrorState error={requestProblem(value.error)} onRetry={() => void value.refetch()} />
          </section>
        ))}
      {props.selectedSource ? (
        <CaptureSelectedSource
          selected={props.selectedSource}
          session={session}
          context={context}
          {...props}
        />
      ) : (
        <CaptureComposer session={session} state={state} context={context} {...props} />
      )}
      {!props.selectedSource && props.view === 'inbox' ? (
        <CaptureInbox session={session} documentsClient={props.documentsClient} />
      ) : null}
      {!props.selectedSource && props.view === 'explore' ? (
        <CaptureExplore
          session={session}
          context={context}
          onViewEvent={props.onViewEvent}
          documentsClient={props.documentsClient}
        />
      ) : null}
      {state.busy ? <p role="status">Saving…</p> : null}
    </section>
  );
}

function WorkspaceHeader({
  session,
  view,
  state,
}: {
  session: CaptureBrowserSession;
  view: CaptureWorkspaceProps['view'];
  state: CaptureEditorState;
}): JSX.Element {
  return (
    <header className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">
        {{ capture: 'Capture', inbox: 'Inbox', explore: 'Explore' }[view]}
      </h2>
      <Button
        variant="ghost"
        disabled={state.busy || state.undoCount === 0}
        onClick={() => void session.editor.undo()}
      >
        <RotateCcw className="size-4" aria-hidden />
        Undo
      </Button>
    </header>
  );
}

function OperationProblem({ session }: { session: CaptureBrowserSession }): JSX.Element | null {
  const editor = session.editor;
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  return state.failure ? (
    <section aria-label={`${state.failure.label} failed`} className="space-y-2">
      <ErrorState error={requestProblem(state.failure.error)} />
      {state.failure.canRetry ? (
        <Button variant="outline" disabled={state.busy} onClick={() => void editor.retry()}>
          Retry {state.failure.label}
        </Button>
      ) : null}
    </section>
  ) : null;
}
