import { Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';

import type { JSX } from 'react';

import type { DecisionEditor, DecisionEditorState } from './editor-types';
import type { useDecisionContext } from './use-decision-context';

/** Failed intents remain inspectable; retries retain their original revision and never rebase uncertain Undo. */
export function DecisionProblems({
  editor,
  state,
  refresh,
}: {
  editor: DecisionEditor;
  state: DecisionEditorState;
  refresh: () => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      {state.conflict && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive p-3">
          <p>The source changed. Your drafts are retained. Reload and review them before saving.</p>
          <Button variant="outline" onClick={refresh}>
            Reload source
          </Button>
        </div>
      )}
      {state.failures.map((failure) => (
        <section aria-label={`${failure.label} failed`} key={failure.key}>
          <ErrorState error={requestProblem(failure.error)} />
          {failure.expectedRevision === state.source.decision.revision && !state.conflict && (
            <Button
              variant="outline"
              disabled={state.busy}
              onClick={() => void editor.retry(failure)}
            >
              Retry {failure.label}
            </Button>
          )}
        </section>
      ))}
    </div>
  );
}
/** Optional catalogue failures remain independent and offer their own retries. */
export function DecisionContextProblems({
  context,
}: {
  context: ReturnType<typeof useDecisionContext>;
}): JSX.Element {
  return (
    <>
      {Object.entries(context.queries)
        .filter(([, query]) => query.isError)
        .map(([name, query]) => (
          <section aria-label={`${name} context unavailable`} key={name}>
            <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
          </section>
        ))}
    </>
  );
}
