import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { ArrowLeft, Plus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { JourneyContext, useJourney } from './context';
import { journeyTitle } from './display';
import { JourneyDocuments } from './documents';
import { JourneyFindings } from './findings';
import { initialJourney } from './fixture';
import { JourneyLegs } from './legs';
import { addLeg, transportModes } from './model';
import { JourneyReview } from './review';
import { JourneySettings } from './settings';
import { JourneyWindowContext } from './window';

import type { JourneyLeg, JourneyScenario } from './model';

/** Journey editing shares one local history while drag previews remain uncommitted. */
export function JourneyWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'legs' | 'window';
  scenario?: JourneyScenario;
}) {
  const history = useRouteState(() => initialJourney(scenario));
  const [legs, previewLegs] = useState<JourneyLeg[] | null>(null);
  const actions = useMemo(
    () => ({
      state: history.state,
      preview: legs ? { ...history.state, legs } : history.state,
      change: history.change,
      previewLegs,
    }),
    [history.state, history.change, legs]
  );
  return (
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
      </main>
    </JourneyContext.Provider>
  );
}

function AddTransport() {
  const { state, change } = useJourney();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-center border-t border-dotted border-foreground/30 py-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Plus className="size-4" aria-hidden />
            Add transport
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 space-y-1">
          {transportModes.map((mode) => (
            <Button
              key={mode.id}
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                change(addLeg(state, mode.id));
                setOpen(false);
              }}
            >
              {mode.label}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
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
