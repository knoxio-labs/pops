import { Button, Progress } from '@pops/ui';

import type { ReactElement } from 'react';

import type { ImportState } from './use-import.js';

function DockStatus({ state }: { state: ImportState }): ReactElement {
  const progressValue =
    state.progress === null || state.progress.total === 0
      ? 0
      : (100 * state.progress.sent) / state.progress.total;
  if (state.phase === 'committing') {
    return (
      <>
        <p aria-live="polite" className="text-sm tabular-nums">
          {`Imported ${String(state.progress?.created ?? 0)} of ${String(state.ready)}`}
        </p>
        <Progress value={progressValue} className="w-64" aria-label="Import progress" />
      </>
    );
  }
  return (
    <p aria-live="polite" className="text-sm tabular-nums">
      {state.phase === 'mapping'
        ? `${String(state.file?.rowCount ?? 0)} rows to check`
        : `${String(state.ready)} to import, ${String(state.skipped)} to skip`}
    </p>
  );
}

function DockAction({ state }: { state: ImportState }): ReactElement {
  if (state.phase === 'mapping') {
    return (
      <Button type="button" disabled={state.problems.length > 0} onClick={() => void state.check()}>
        {`Check ${String(state.file?.rowCount ?? 0)} rows`}
      </Button>
    );
  }
  const committing = state.phase === 'committing';
  return (
    <Button
      type="button"
      loading={committing}
      disabled={committing || state.ready === 0}
      onClick={() => void state.commit()}
    >
      {state.skipped > 0
        ? `Import ${String(state.ready)}, skip ${String(state.skipped)}`
        : `Import ${String(state.ready)} items`}
    </Button>
  );
}

/** Renders the import progress dock and its phase-specific action. */
export function ImportDock({ state }: { state: ImportState }): ReactElement | null {
  if (state.file === null || state.phase === 'upload' || state.phase === 'done') return null;
  const committing = state.phase === 'committing';
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card py-1.5 pr-1.5 pl-4 shadow-lg">
      <DockStatus state={state} />
      <span className="ml-auto" />
      <Button type="button" variant="ghost" disabled={committing} onClick={state.back}>
        Back
      </Button>
      <DockAction state={state} />
    </div>
  );
}
