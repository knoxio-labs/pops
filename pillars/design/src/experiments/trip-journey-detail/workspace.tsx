import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { AddTransport } from './add-transport';
import { JourneyContext, useJourney } from './context';
import { journeyTitle } from './display';
import { JourneyDocuments } from './documents';
import { JourneyFindings } from './findings';
import { JourneyLegs } from './legs';
import { initialJourneyOptions } from './option-model';
import { JourneyOptions } from './options';
import { JourneyOptionsContext } from './options-context';
import { JourneyReview } from './review';
import { JourneySettings } from './settings';
import { JourneyWindowContext } from './window';

import type { JourneyLeg, JourneyScenario, JourneyState } from './model';

/** Journey editing shares one local history while drag previews remain uncommitted. */
export function JourneyWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'legs' | 'window';
  scenario?: JourneyScenario;
}) {
  const history = useRouteState(() => initialJourneyOptions(scenario));
  const [legs, previewLegs] = useState<JourneyLeg[] | null>(null);
  const actions = useMemo(
    () => ({
      state: history.state.current,
      preview: legs ? { ...history.state.current, legs } : history.state.current,
      change: (current: JourneyState) => history.change({ ...history.state, current }),
      previewLegs,
    }),
    [history.state, history.change, legs]
  );
  return (
    <JourneyOptionsContext.Provider value={{ state: history.state, change: history.change }}>
      <JourneyContext.Provider value={actions}>
        <JourneyReview layout={layout} />
        <main className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
          <JourneyHeader
            canUndo={history.canUndo}
            undo={() => {
              history.undo();
              previewLegs(null);
            }}
          />
          <JourneyFindings />
          {layout === 'window' && <JourneyWindowContext side="before" />}
          <JourneyLegs />
          <AddTransport />
          {layout === 'window' ? (
            <JourneyWindowContext side="after" />
          ) : (
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm">
                Departure and arrival context
              </summary>
              <JourneyWindowContext side="before" />
              <JourneyWindowContext side="after" />
            </details>
          )}
          <JourneyDocuments />
          <JourneySettings />
          <JourneyOptions />
        </main>
      </JourneyContext.Provider>
    </JourneyOptionsContext.Provider>
  );
}

function JourneyHeader({ canUndo, undo }: { canUndo: boolean; undo: () => void }) {
  const { state } = useJourney();
  return (
    <header className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" className="px-0">
          <a target="_top" href="/design/x/trip-route-editing/direct/s/trips/route">
            <ArrowLeft className="size-4" aria-hidden />
            {tripDisplayName(tripMetadata)}
          </a>
        </Button>
        <Button
          variant="ghost"
          disabled={!canUndo}
          onClick={() => {
            undo();
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          Undo
        </Button>
      </div>
      <h1 className="text-2xl font-bold">{journeyTitle(state)}</h1>
    </header>
  );
}
