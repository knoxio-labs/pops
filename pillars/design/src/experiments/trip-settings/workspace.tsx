import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { TagField, ParentField } from './associations';
import { SettingsContext, useSettings } from './context';
import { DestinationField, NameField, DateFields, NotesField } from './fields';
import { initialSettings } from './fixture';
import { SettingsHeading, SettingsActions, SettingsIssues } from './form-parts';
import { settingsFindings, saveSettings } from './model';
import { SettingsReview } from './review';

import type { SettingsScenario } from './fixture';

/** Create with optional metadata, then revise the same trip through either proposal. */
export function SettingsWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'quick' | 'full';
  scenario?: SettingsScenario;
}) {
  const history = useRouteState(() => initialSettings(scenario));
  const value = useMemo(
    () => ({ state: history.state, change: history.change }),
    [history.state, history.change]
  );
  return (
    <SettingsContext.Provider value={value}>
      <SettingsReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <header className="flex items-center justify-between">
          <Button asChild variant="ghost">
            <a target="_top" href="/design/x/trip-overview-shape/route-first/s/trips/overview">
              <ArrowLeft className="size-4" aria-hidden />
              Trips
            </a>
          </Button>
          <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </header>
        <SettingsForm layout={layout} />
      </main>
    </SettingsContext.Provider>
  );
}

function SettingsForm({ layout }: { layout: 'quick' | 'full' }) {
  const { state, change } = useSettings();
  const created = state.saved !== null;
  const findings = settingsFindings(state);
  const pristine = created && JSON.stringify(state.trip) === JSON.stringify(state.saved);
  return (
    <form
      aria-label="Trip settings"
      noValidate
      className="space-y-4 rounded-xl border border-foreground/30 bg-muted/60 p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        change(saveSettings(state));
      }}
    >
      <SettingsHeading pristine={pristine} />
      <DestinationField />
      {layout === 'quick' && !created ? (
        <details open={findings.length > 0}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            More options
          </summary>
          <OptionalFields />
        </details>
      ) : (
        <OptionalFields />
      )}
      <SettingsIssues />
      <SettingsActions pristine={pristine} />
    </form>
  );
}

function OptionalFields() {
  return (
    <div className="space-y-4">
      <NameField />
      <DateFields />
      <TagField />
      <ParentField />
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Notes</summary>
        <NotesField />
      </details>
    </div>
  );
}
