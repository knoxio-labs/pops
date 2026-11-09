import { ErrorState } from '@pops/ui';

import { sourceProblem } from './source';

/** Render safe owning-source diagnostics with an explicit query retry action. */
export function SourceFailure({ error, retry }: { error: unknown; retry: () => Promise<unknown> }) {
  return (
    <ErrorState
      error={sourceProblem(error)}
      onRetry={() => {
        void retry();
      }}
    />
  );
}
