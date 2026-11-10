import { Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { canRetryJourneyChange } from './model';

import type { JSX } from 'react';

import type { JourneyEditor } from './use-journey-editor';

/** Ambiguous membership changes reload canonical source before permitting another write. */
export function JourneyWriteFailure({
  editor,
  reload,
}: {
  editor: JourneyEditor;
  reload: () => Promise<boolean>;
}): JSX.Element | null {
  if (!editor.failure) return null;
  const repeatable = canRetryJourneyChange(editor.failure.change);
  return (
    <div className="space-y-2">
      <ErrorState
        error={requestProblem(editor.failure.error)}
        onRetry={repeatable ? editor.retry : undefined}
      />
      {repeatable ? (
        <Button variant="ghost" onClick={editor.discard}>
          Discard unsaved changes
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            void reload().then((succeeded) => {
              if (succeeded) editor.discard();
            });
          }}
        >
          Reload journey
        </Button>
      )}
    </div>
  );
}
