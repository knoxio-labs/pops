import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { ArrowLeft, RotateCcw, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';

import { Button, cn } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { StayContext, useStay } from './context';
import { StayEditor } from './editor';
import { initialStay } from './fixture';
import { stayFindings } from './model';
import { StayReview } from './review';
import { StayTimeline, TimelineRow } from './timeline';

import type { StayScenario } from './fixture';

/** Both stay proposals edit one local history; source bookings are never changed remotely. */
export function StayWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'details' | 'visit';
  scenario?: StayScenario;
}) {
  const history = useRouteState(() => initialStay(scenario));
  const actions = useMemo(
    () => ({ state: history.state, change: history.change }),
    [history.state, history.change]
  );
  return (
    <StayContext.Provider value={actions}>
      <StayReview layout={layout} />
      <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <header className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <a target="_top" href="/design/x/trip-visit-workspace/periods/s/trips/visit">
              <ArrowLeft className="size-4" aria-hidden />
              {tripDisplayName(tripMetadata)}
            </a>
          </Button>
          <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </header>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold">{history.state.visit.name}</h1>
        </div>
        <StayIssues />
        {layout === 'visit' ? (
          <StayTimeline includeEditor />
        ) : (
          <>
            <TimelineRow from={history.state.from} to={history.state.to}>
              <StayEditor />
            </TimelineRow>
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                Visit timeline
              </summary>
              <StayTimeline includeEditor={false} />
            </details>
          </>
        )}
      </main>
    </StayContext.Provider>
  );
}

function StayIssues() {
  const { state } = useStay();
  const findings = stayFindings(state);
  if (findings.length === 0) return null;
  return (
    <section aria-label="Stay issues" className="space-y-2">
      {findings.map((finding) => (
        <div
          key={finding.id}
          className={cn(
            'flex gap-2 rounded-lg border px-3 py-2 text-sm',
            finding.kind === 'conflict'
              ? 'border-destructive bg-destructive/10'
              : 'border-dashed border-foreground/30 bg-muted/40'
          )}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-app-accent" aria-hidden />
          <div>
            <p className="font-medium">{finding.title}</p>
            <p className="text-muted-foreground">{finding.detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
