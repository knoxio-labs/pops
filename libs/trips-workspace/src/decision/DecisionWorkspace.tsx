import { RotateCcw } from 'lucide-react';

import { Button, ErrorState, PageHeader } from '@pops/ui';

import { useSourceQuery } from '../shared/use-source-query';
import { requestProblem } from '../stay/api';
import { decisionQueryKey, loadDecision } from './api';
import { DecisionContents } from './DecisionContents';
import { DecisionContextProblems, DecisionProblems } from './DecisionProblems';
import { useDecisionContext } from './use-decision-context';
import { useDecisionEditor } from './use-decision-editor';

import type { UseQueryResult } from '@tanstack/react-query';
import type { JSX } from 'react';

import type { DecisionEditorState } from './editor-types';
import type { DecisionSource, DecisionWorkspaceProps } from './types';

/** Approved options-first workspace, backed solely by the owning Trips contract and guarded source writes. */
export function DecisionWorkspace(props: DecisionWorkspaceProps): JSX.Element {
  if (![props.tripId, props.decisionId].every((id) => Number.isSafeInteger(id) && id > 0))
    return (
      <ErrorState
        error={{
          code: 'trips.identity.invalid',
          message: 'Choose a valid trip and decision',
          retryable: false,
        }}
      />
    );
  return <LoadDecision key={JSON.stringify(decisionQueryKey(props))} {...props} />;
}
function LoadDecision(props: DecisionWorkspaceProps): JSX.Element {
  const source = useSourceQuery(
    { client: props.client, tripId: props.tripId, kind: 'decision', sourceId: props.decisionId },
    (owner) => {
      const captured = { client: owner.client, tripId: owner.tripId, decisionId: owner.sourceId };
      return {
        queryKey: decisionQueryKey(captured),
        load: (context) => loadDecision(captured, context.signal),
      };
    }
  );
  const context = useDecisionContext(props);
  if (source.ownershipError) return <ErrorState error={source.ownershipError} />;
  if (source.data === undefined)
    return source.isError ? (
      <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
    ) : (
      <p role="status" className="p-6">
        Loading decision…
      </p>
    );
  return (
    <DecisionSession initial={source.data} identity={props} context={context} query={source} />
  );
}
function DecisionSession({
  initial,
  identity,
  context,
  query,
}: {
  initial: DecisionSource;
  identity: DecisionWorkspaceProps;
  context: ReturnType<typeof useDecisionContext>;
  query: UseQueryResult<DecisionSource>;
}): JSX.Element {
  const { editor, state } = useDecisionEditor(initial, identity);
  const refresh = async (): Promise<void> => {
    const result = await query.refetch();
    if (result.data) editor.reload(result.data);
  };
  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
      <PageHeader
        title="Decision"
        backHref={identity.backHref}
        actions={
          <Button
            variant="ghost"
            disabled={state.busy || state.dirty || state.conflict || state.undoCount === 0}
            onClick={() => void editor.undo()}
          >
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        }
      />
      {query.isError && (
        <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
      )}
      <DecisionProblems editor={editor} state={state} refresh={() => void refresh()} />
      <DecisionContextProblems context={context} />
      <p role="status" className="text-sm text-muted-foreground">
        {decisionStatus(state)}
      </p>
      <DecisionContents editor={editor} state={state} plans={context.plans} />
    </main>
  );
}

function decisionStatus(state: DecisionEditorState): string {
  if (state.busy) return 'Saving…';
  if (state.failures.length > 0) return 'Changes have not been saved';
  return state.dirty ? 'Unsaved changes' : 'Changes saved';
}
