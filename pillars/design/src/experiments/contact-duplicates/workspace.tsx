import { ArrowLeft, GitCompareArrows, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { DuplicateChoices } from './choices';
import { DuplicateSourceCards } from './facts';
import { createDuplicateState } from './fixture';
import {
  duplicatePreviewError,
  duplicateSources,
  previewDuplicateMerge,
  separateDuplicatePair,
} from './model';
import { CombinedFacts, DuplicateResult } from './preview';
import { DuplicateReview } from './review';

import type { DuplicateScenario, DuplicateState } from './model';

/** Reviews independent source choices and a read-only result, with reversible local pair dismissal. */
export function DuplicateWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'sources' | 'fields';
  scenario?: DuplicateScenario;
}) {
  const history = useRouteState(() => createDuplicateState(scenario));
  const [showPreview, setShowPreview] = useState(false);
  const preview = previewDuplicateMerge(history.state);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DuplicateReview layout={layout} />
      <main className="mx-auto max-w-xl space-y-5 px-4 py-6 text-sm md:py-8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Contacts</span>
          <Button
            variant="ghost"
            className="min-h-11 text-sm"
            disabled={!history.canUndo}
            onClick={() => {
              history.undo();
              setShowPreview(false);
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> Undo
          </Button>
        </div>
        <DuplicateHeader showPreview={showPreview} />
        {showPreview && preview ? (
          <>
            <DuplicateResult preview={preview} state={history.state} />
            <Button
              variant="outline"
              className="min-h-11 text-sm"
              onClick={() => setShowPreview(false)}
            >
              <ArrowLeft className="size-4" aria-hidden /> Edit choices
            </Button>
          </>
        ) : (
          <DuplicateComparison
            state={history.state}
            change={history.change}
            layout={layout}
            openPreview={() => setShowPreview(true)}
          />
        )}
      </main>
    </div>
  );
}

function DuplicateComparison({
  state,
  change,
  layout,
  openPreview,
}: {
  state: DuplicateState;
  change: (state: DuplicateState) => void;
  layout: 'sources' | 'fields';
  openPreview: () => void;
}) {
  const sources = duplicateSources(state);
  const error = duplicatePreviewError(state);
  const preview = previewDuplicateMerge(state);
  if (state.separated)
    return (
      <p role="status" className="rounded-xl border border-border bg-card p-4">
        Contacts kept separate in this review.
      </p>
    );
  if (sources.length < 2)
    return (
      <p role="status" className="rounded-xl border border-border bg-card p-4">
        {error ?? 'No contact pair to review.'}
      </p>
    );
  return (
    <div className="space-y-5">
      {layout === 'sources' && <DuplicateSourceCards contacts={sources} />}
      <DuplicateChoices state={state} change={change} />
      {layout === 'fields' && preview && <CombinedFacts preview={preview} state={state} />}
      {layout === 'fields' && <SourceDisclosure state={state} />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          className="min-h-11 text-sm"
          onClick={() => change(separateDuplicatePair(state))}
        >
          Keep separate
        </Button>
        <Button
          className="min-h-11 bg-app-accent text-app-accent-foreground text-sm hover:bg-app-accent/90"
          disabled={!!error}
          onClick={openPreview}
        >
          <GitCompareArrows className="size-4" aria-hidden /> Preview merge
        </Button>
      </footer>
    </div>
  );
}

function DuplicateHeader({ showPreview }: { showPreview: boolean }) {
  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold leading-tight tracking-normal">
        {showPreview ? 'Merge preview' : 'Review duplicate contacts'}
      </h1>
    </header>
  );
}

function SourceDisclosure({ state }: { state: DuplicateState }) {
  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Sources</summary>
      <DuplicateSourceCards contacts={duplicateSources(state)} />
    </details>
  );
}
