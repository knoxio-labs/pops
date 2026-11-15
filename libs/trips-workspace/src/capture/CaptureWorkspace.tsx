import { RotateCcw } from 'lucide-react';

import { Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { CaptureComposer } from './CaptureComposer';
import { CaptureContactChooser } from './CaptureContactChooser';
import { CaptureExplore } from './CaptureExplore';
import { CaptureInbox } from './CaptureInbox';
import { CaptureMembershipAction } from './CaptureMembershipContext';
import { CaptureOperationProblem } from './CaptureOperationProblem';
import { CaptureSelectedSource } from './CaptureSelectedSource';
import { CaptureSessionBoundary } from './CaptureSessionBoundary';
import { useCaptureContext } from './use-capture-context';
import { useCaptureEditor } from './use-capture-editor';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureSessionView } from './CaptureSessionBoundary';
import type { CaptureEditorState } from './editor-types';
import type { CaptureWorkspaceProps } from './types';

/** Contextual Capture tools retain one owning-trip composer and command history across view remounts. */
export function CaptureWorkspace(props: CaptureWorkspaceProps): JSX.Element {
  return (
    <CaptureSessionBoundary {...props}>
      {(view) => <WorkspaceSession {...props} {...view} />}
    </CaptureSessionBoundary>
  );
}

function WorkspaceSession({
  session,
  query,
  scope,
  ...props
}: CaptureWorkspaceProps & CaptureSessionView): JSX.Element {
  const state = useCaptureEditor(session, props, query.data, scope.key);
  const context = useCaptureContext(props, scope);
  return (
    <section
      aria-label="Capture tools"
      className={
        props.compact
          ? 'space-y-2 rounded-2xl border border-trip-line bg-trip-surface p-3'
          : 'space-y-5'
      }
    >
      <WorkspaceHeader session={session} view={props.view} state={state} compact={props.compact} />
      <CaptureContactChooser session={session} />
      {query.isError ? (
        <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      <CaptureOperationProblem session={session} scope={scope} identity={props} />
      <ContextProblems context={context} />
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
      {props.selectedSource && (
        <CaptureMembershipAction
          session={session}
          source={props.selectedSource}
          tripId={props.tripId}
        />
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

function ContextProblems({
  context,
}: {
  context: ReturnType<typeof useCaptureContext>;
}): JSX.Element {
  return (
    <>
      {Object.entries(context)
        .filter(([, value]) => value.isError)
        .map(([key, value]) => (
          <section aria-label={`${key} unavailable`} key={key}>
            <ErrorState error={requestProblem(value.error)} onRetry={() => void value.refetch()} />
          </section>
        ))}
    </>
  );
}

function WorkspaceHeader({
  session,
  view,
  state,
  compact,
}: {
  session: CaptureBrowserSession;
  view: CaptureWorkspaceProps['view'];
  state: CaptureEditorState;
  compact?: boolean;
}): JSX.Element {
  return (
    <header className="flex items-center justify-between gap-3">
      <h2 className={compact ? 'text-sm font-semibold' : 'text-lg font-semibold'}>
        {{ capture: 'Capture', inbox: 'Inbox', explore: 'Explore' }[view]}
      </h2>
      {(!compact || state.undoCount > 0) && (
        <Button
          variant="ghost"
          disabled={state.busy || state.undoCount === 0}
          onClick={() => void session.editor.undo()}
        >
          <RotateCcw className="size-4" aria-hidden />
          Undo
        </Button>
      )}
    </header>
  );
}
