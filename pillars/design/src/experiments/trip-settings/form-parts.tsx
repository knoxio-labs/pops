import { Check, Plus, Settings2, TriangleAlert } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { useSettings } from './context';
import { settingsFindings, settingsTitle } from './model';

/** The title preview is deterministic; save status describes the local snapshot. */
export function SettingsHeading({ pristine }: { pristine: boolean }) {
  const { state } = useSettings();
  const created = state.saved !== null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Settings2 className="size-5 text-app-accent" aria-hidden />
          {created ? 'Trip settings' : 'New trip'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{settingsTitle(state.trip)}</p>
      </div>
      {pristine && (
        <Badge variant="outline" className="gap-1 border-app-accent text-app-accent">
          <Check className="size-3" aria-hidden />
          Saved
        </Badge>
      )}
    </div>
  );
}

/** Save only valid sources; discarding restores the saved trip without deleting catalogues. */
export function SettingsActions({ pristine }: { pristine: boolean }) {
  const { state, change } = useSettings();
  const created = state.saved !== null;
  const findings = settingsFindings(state);
  return (
    <footer className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      {created && (
        <Button
          type="button"
          variant="ghost"
          disabled={pristine}
          onClick={() => {
            if (state.saved) change({ ...state, trip: { ...state.saved } });
          }}
        >
          Discard changes
        </Button>
      )}
      <Button type="submit" disabled={findings.length > 0 || pristine}>
        {created ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        {created ? 'Save changes' : 'Create trip'}
      </Button>
    </footer>
  );
}

/** Render actionable findings only when a captured field or reference requires correction. */
export function SettingsIssues() {
  const { state } = useSettings();
  const findings = settingsFindings(state);
  if (!findings.length) return null;
  return (
    <section aria-label="Settings issues" className="space-y-2">
      {findings.map((finding) => (
        <div
          key={finding.id}
          className="flex gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm"
        >
          <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
          {finding.message}
        </div>
      ))}
    </section>
  );
}
