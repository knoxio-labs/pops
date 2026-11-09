import { MoreHorizontal, Plus } from 'lucide-react';
import { useId, useState } from 'react';

import { Button, Textarea } from '@pops/ui';

import { useExplore } from './context';
import { ExploreCity, ExploreKind, exploreKindOptions } from './fields';
import { captureExploreRecord, emptyExploreDraft } from './model';

import type { ExploreDraft } from './model';

/** Captures verbatim text with optional kind and location, without requiring dates. */
export function ExploreCapture() {
  const { state, change } = useExplore();
  const [draft, setDraft] = useState(() => emptyExploreDraft());
  const [error, setError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsId = useId();
  return (
    <form
      aria-label="Save possibility"
      className="space-y-2 rounded-xl border border-border bg-card p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50"
      onSubmit={(event) => {
        event.preventDefault();
        const result = captureExploreRecord(state, draft, crypto.randomUUID());
        if (result.error) {
          setError(result.error);
          return;
        }
        change(result.state);
        setDraft(emptyExploreDraft());
        setOptionsOpen(false);
        setError(null);
      }}
    >
      <CaptureInput
        draft={draft}
        change={setDraft}
        optionsOpen={optionsOpen}
        optionsId={optionsId}
        toggle={() => setOptionsOpen(!optionsOpen)}
      />
      <CaptureDetails
        draft={draft}
        change={setDraft}
        optionsOpen={optionsOpen}
        optionsId={optionsId}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

interface CaptureDraftProps {
  draft: ExploreDraft;
  change: (draft: ExploreDraft) => void;
  optionsOpen: boolean;
  optionsId: string;
}

function CaptureInput({
  draft,
  change,
  optionsOpen,
  optionsId,
  toggle,
}: CaptureDraftProps & { toggle: () => void }) {
  return (
    <div className="flex items-start gap-1">
      <Textarea
        aria-label="Possibility"
        rows={1}
        className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder="Save a possibility…"
        value={draft.name}
        onChange={(event) => change({ ...draft, name: event.currentTarget.value })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Capture options"
        aria-expanded={optionsOpen}
        aria-controls={optionsId}
        onClick={toggle}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </Button>
      <Button type="submit" variant="secondary" disabled={!draft.name.trim()}>
        <Plus className="size-4" aria-hidden />
        Save
      </Button>
    </div>
  );
}

function CaptureDetails({ draft, change, optionsOpen, optionsId }: CaptureDraftProps) {
  const { state } = useExplore();
  return (
    <>
      {optionsOpen && (
        <div id={optionsId} className="flex flex-wrap items-end gap-2 border-t pt-2">
          <div className="min-w-0 flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Kind</span>
            <ExploreKind
              value={draft.kind}
              change={(kind) => {
                const defaults = emptyExploreDraft(kind);
                change({ ...draft, kind, status: defaults.status, purpose: defaults.purpose });
              }}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Location</span>
            <ExploreCity value={draft.cityId} change={(cityId) => change({ ...draft, cityId })} />
          </div>
        </div>
      )}
      {!optionsOpen && (draft.kind || draft.cityId) && (
        <p className="px-3 text-xs text-muted-foreground">
          {[
            exploreKindOptions.find((kind) => kind.value === draft.kind)?.label,
            draft.cityId
              ? (state.cities.find((place) => place.id === draft.cityId)?.name ??
                'Location unavailable')
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </>
  );
}
