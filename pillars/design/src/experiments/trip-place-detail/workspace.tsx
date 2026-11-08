import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { ArrowLeft, RotateCcw, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { IdeaContext, useIdea } from './context';
import { IdeaEditor } from './editor';
import { initialIdea } from './fixture';
import { ideaFindings, ideaTimingLabel } from './model';
import { IdeaReview } from './review';
import { IdeaRail, IdeaRoute } from './route';

import type { IdeaScenario } from './fixture';

/** Both idea proposals share typed local facts and undo, without altering bookings or source catalogues. */
export function IdeaWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'details' | 'route';
  scenario?: IdeaScenario;
}) {
  const history = useRouteState(() => initialIdea(scenario));
  const actions = useMemo(
    () => ({ state: history.state, change: history.change }),
    [history.state, history.change]
  );
  return (
    <IdeaContext.Provider value={actions}>
      <IdeaReview layout={layout} />
      <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <header className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <a target="_top" href="/design/x/trip-route-editing/direct/s/trips/route">
              <ArrowLeft className="size-4" aria-hidden />
              {tripDisplayName(tripMetadata)}
            </a>
          </Button>
          <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </header>
        <h1 className="text-2xl font-bold">Place / idea</h1>
        <IdeaIssues />
        {layout === 'route' ? (
          <IdeaRoute includeEditor />
        ) : (
          <>
            <IdeaRail label={ideaTimingLabel(history.state)} idea>
              <IdeaEditor />
            </IdeaRail>
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                Route context
              </summary>
              <IdeaRoute includeEditor={false} />
            </details>
          </>
        )}
      </main>
    </IdeaContext.Provider>
  );
}

function IdeaIssues() {
  const { state } = useIdea();
  const findings = ideaFindings(state);
  if (findings.length === 0) return null;
  return (
    <section aria-label="Idea issues" className="space-y-2">
      {findings.map((finding) => (
        <div
          key={finding.id}
          className="flex gap-2 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-medium">{finding.title}</p>
            <p className="text-muted-foreground">{finding.detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
