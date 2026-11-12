import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';

import { ApiError } from '@pops/pillar-sdk/client';
import { Button, ErrorState, TextInput } from '@pops/ui';

import {
  assertSourceOwner,
  RetainedSessionStore,
  SourceSessionView,
} from '../shared/retained-session-store';
import { useRetainedSession } from '../shared/use-retained-session';
import { useSourceQuery } from '../shared/use-source-query';
import { requestProblem } from '../stay/api';
import { loadCaptureSource, performCaptureRequest } from './api';
import { createCaptureEditor } from './editor';

import type { JSX } from 'react';

import type { RetainedSourceOwner } from '../shared/retained-session-store';
import type { CaptureEditor, CaptureEditorState } from './editor-types';
import type { CaptureIdentity, CaptureResult, CaptureSource } from './types';

/** Direct Idea creation preserves its draft and exact retained command across contextual remounts. */
export interface IdeaCreateContextProps extends CaptureIdentity {
  onCreated: (source: { kind: 'idea'; id: number }) => void;
}

class IdeaCreationSession {
  editor: CaptureEditor | undefined;
  private deliveredOperationId: string | null = null;
  constructor(readonly owner: RetainedSourceOwner) {}
  initialise(source: CaptureSource): CaptureEditor {
    this.editor ??= createCaptureEditor({
      source,
      tripId: this.owner.tripId,
      perform: async (request) => {
        assertSourceOwner(this.owner);
        const result = await performCaptureRequest(this.owner, request);
        assertSourceOwner(this.owner);
        createdIdea(result, this.owner.tripId);
        return result;
      },
    });
    return this.editor;
  }
  undelivered(result: CaptureResult): boolean {
    return this.deliveredOperationId !== result.receipt.operationId;
  }
  delivered(result: CaptureResult): void {
    this.deliveredOperationId = result.receipt.operationId;
  }
}
const sessions = new RetainedSessionStore<IdeaCreationSession>();

/** Create an independent Idea through the canonical receipt-backed Capture engine and original owner. */
export function IdeaCreateContext(props: IdeaCreateContextProps): JSX.Element {
  if (!Number.isSafeInteger(props.tripId) || props.tripId < 1)
    return (
      <ErrorState
        error={{ code: 'trips.identity.invalid', message: 'Choose a valid trip', retryable: false }}
      />
    );
  return <IdeaSource {...props} />;
}

function IdeaSource(props: IdeaCreateContextProps): JSX.Element {
  const identity = { ...props, kind: 'idea-create', sourceId: 0 };
  const { session } = useRetainedSession(
    sessions,
    identity,
    (owner) => new IdeaCreationSession(owner)
  );
  const source = useSourceQuery(identity, (owner) => ({
    queryKey: ['trips', owner.origin, owner.tripId, 'idea-create-source'],
    load: async ({ signal }) => {
      const result = await loadCaptureSource(owner, signal);
      assertSourceOwner(owner);
      return result;
    },
  }));
  if (source.ownershipError) return <ErrorState error={requestProblem(source.ownershipError)} />;
  const editor = session.editor ?? (source.data && session.initialise(source.data));
  const problem = source.isError ? (
    <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
  ) : null;
  if (!editor) return problem ?? <p role="status">Loading source…</p>;
  return (
    <>
      {problem}
      <IdeaForm {...props} session={session} editor={editor} />
    </>
  );
}

type FormProps = IdeaCreateContextProps & { session: IdeaCreationSession; editor: CaptureEditor };

function useIdeaCreation({ session, editor, onCreated }: FormProps): {
  state: CaptureEditorState;
  name: string;
  deliver: (result: CaptureResult) => void;
  submit: (retry: boolean) => Promise<void>;
  change: (value: string) => void;
} {
  const binding = useMemo(
    () => ({ view: new SourceSessionView(session.owner), onCreated }),
    [session, onCreated]
  );
  useLayoutEffect(() => {
    binding.view.activate();
    return () => binding.view.deactivate();
  }, [binding]);
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const name =
    state.draft.target?.mode === 'createIdea' ? (state.draft.target.input.name ?? '') : '';
  const deliver = (result: CaptureResult): void => {
    if (!binding.view.isCurrent()) return;
    session.delivered(result);
    binding.onCreated({ kind: 'idea', id: createdIdea(result, session.owner.tripId) });
  };
  const submit = async (retry: boolean): Promise<void> => {
    if (!binding.view.isCurrent() || editor.getState().busy) return;
    const confirmed = retry
      ? await editor.retry()
      : await editor.commit({ kind: 'idea.create', input: { name: name || null } }, 'Create Idea');
    if (!confirmed) return;
    const { scope, origin, tripId } = session.owner;
    void scope.invalidateQueries({ queryKey: ['trips', origin, tripId] });
    editor.clearDraft();
    const result = editor.getState().confirmation?.result;
    if (result) deliver(result);
  };
  const change = (value: string): void => {
    if (binding.view.isCurrent())
      editor.editDraft({ target: { mode: 'createIdea', input: { name: value } } });
  };
  return { state, name, deliver, submit, change };
}

function IdeaForm(props: FormProps): JSX.Element {
  const { state, name, deliver, submit, change } = useIdeaCreation(props);
  const confirmation = state.confirmation?.result;
  if (confirmation && props.session.undelivered(confirmation))
    return <Button onClick={() => deliver(confirmation)}>Open created Idea</Button>;
  return (
    <form
      aria-label="New Idea"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!state.failure) void submit(false);
      }}
    >
      <TextInput
        label="Name"
        value={name}
        disabled={state.busy || state.failure !== null}
        onChange={(event) => change(event.currentTarget.value)}
      />
      {state.failure && (
        <ErrorState
          error={requestProblem(state.failure.error)}
          onRetry={state.failure.canRetry ? () => void submit(true) : undefined}
        />
      )}
      <Button type="submit" disabled={state.busy || state.failure !== null}>
        {state.busy ? 'Creating…' : 'Create Idea'}
      </Button>
    </form>
  );
}

function createdIdea(result: CaptureResult, tripId: number): number {
  const idea = result.receipt.ideas[0];
  if (
    result.receipt.ideas.length !== 1 ||
    !idea ||
    idea.tripId !== tripId ||
    !result.current.ideas.some(
      (current) => current.id === idea.id && current.tripId === tripId && current.removedAt === null
    )
  )
    throw new ApiError({
      code: 'trips.idea.response_invalid',
      kind: 'client',
      message: 'The source response did not confirm the created Idea. Retry the retained request.',
      retryable: true,
    });
  return idea.id;
}
