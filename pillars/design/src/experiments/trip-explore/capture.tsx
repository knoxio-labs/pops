import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, Textarea } from '@pops/ui';

import { useExplore } from './context';
import { ExploreCity, ExploreKind } from './fields';
import { captureExploreRecord, emptyExploreDraft } from './model';

/** Captures verbatim text with optional kind and location, without requiring dates. */
export function ExploreCapture() {
  const { state, change } = useExplore();
  const [draft, setDraft] = useState(() => emptyExploreDraft());
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      aria-label="Save possibility"
      className="space-y-3 rounded-xl border border-foreground/30 bg-muted/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const result = captureExploreRecord(state, draft, crypto.randomUUID());
        if (result.error) {
          setError(result.error);
          return;
        }
        change(result.state);
        setDraft(emptyExploreDraft());
        setError(null);
      }}
    >
      <Textarea
        aria-label="Possibility"
        className="min-h-20"
        placeholder="Save a possibility…"
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
      />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <span className="text-xs text-muted-foreground">Kind</span>
          <ExploreKind
            value={draft.kind}
            change={(kind) => {
              const defaults = emptyExploreDraft(kind);
              setDraft({ ...draft, kind, status: defaults.status, purpose: defaults.purpose });
            }}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <span className="text-xs text-muted-foreground">Location</span>
          <ExploreCity value={draft.cityId} change={(cityId) => setDraft({ ...draft, cityId })} />
        </div>
        <Button type="submit" disabled={!draft.name.trim()}>
          <Plus className="size-4" aria-hidden />
          Save
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
