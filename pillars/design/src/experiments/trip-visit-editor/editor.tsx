import { TriangleAlert } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { VisitArrangements } from './arrangements';
import { useVisitEditor } from './context';
import { VisitDates, ApproximateTiming, VisitNotes } from './fields';
import { visitErrors, visitFindings } from './model';
import { VisitPlace } from './place';

/** Edit visit timing without modifying any related booking source. */
export function VisitEditor({ onSave, onDiscard }: { onSave: () => void; onDiscard: () => void }) {
  const { state, mode } = useVisitEditor();
  const errors = visitErrors(state, state.draft);
  const findings = visitFindings(state, state.draft);
  const source = state.visits.find((visit) => visit.id === state.draft.id);
  const dirty = !source || JSON.stringify(source) !== JSON.stringify(state.draft);
  return (
    <article
      aria-label="Visit editor"
      className={`space-y-3 rounded-xl border border-dashed bg-muted/60 p-4 shadow-sm ${errors.length || findings.length ? 'border-destructive' : 'border-foreground/30'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{state.creating ? 'Add visit' : 'Edit visit'}</h1>
        {mode === 'draft' && dirty && <Badge variant="outline">Unsaved</Badge>}
      </div>
      <VisitPlace />
      <VisitDates />
      <ApproximateTiming />
      <VisitNotes />
      {(errors.length > 0 || findings.length > 0) && (
        <section aria-label="Visit issues" className="space-y-2">
          {[...errors, ...findings.map((finding) => finding.message)].map((message) => (
            <p
              key={message}
              className="flex gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm"
            >
              <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
              {message}
            </p>
          ))}
        </section>
      )}
      <VisitArrangements />
      {mode === 'draft' && (
        <footer className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" onClick={onDiscard} disabled={!dirty}>
            Discard
          </Button>
          <Button onClick={onSave} disabled={!dirty || errors.length > 0}>
            {state.creating ? 'Add visit' : 'Save changes'}
          </Button>
        </footer>
      )}
    </article>
  );
}
