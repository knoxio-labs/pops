import { Bus, Car, Footprints, GripVertical, Plane, Ship, TrainFront, Trash2 } from 'lucide-react';

import { Button, SortableGrid, cn } from '@pops/ui';

import { useJourney } from './context';
import { durationLabel, endpointDay, legLabel } from './display';
import { JourneyEndpoints } from './endpoints';
import { LegMetadata, LegMode, LegStatus } from './metadata';
import { connectionMinutes, endpointLabel, journeyFindings, legMinutes, removeLeg } from './model';
import { JourneyTimelineRow } from './timeline-row';

import type { JourneyLeg } from './model';

/** Transport mode icons correspond to the prototype's explicit mode catalogue. */
export const journeyModeIcons = {
  flight: Plane,
  train: TrainFront,
  bus: Bus,
  car: Car,
  ferry: Ship,
  walk: Footprints,
};

/** Whole-card sorting retains original clocks and highlights contradictions during the drag preview. */
export function JourneyLegs() {
  const { state, preview, change, previewLegs } = useJourney();
  return (
    <SortableGrid
      items={state.legs}
      getKey={(leg) => leg.id}
      columnsClassName="grid-cols-1"
      className="gap-0"
      onPreviewOrderChange={previewLegs}
      onReorder={(legs) => {
        change({ ...state, legs });
        previewLegs(null);
      }}
      renderItem={(leg) => {
        const next = preview.legs[preview.legs.findIndex((item) => item.id === leg.id) + 1];
        return (
          <div>
            <JourneyTimelineRow day={endpointDay(leg.from)} Icon={journeyModeIcons[leg.mode]}>
              <LegCard leg={leg} />
            </JourneyTimelineRow>
            {next && <Connection previous={leg} next={next} />}
          </div>
        );
      }}
    />
  );
}

function LegCard({ leg }: { leg: JourneyLeg }) {
  const { state, preview, change } = useJourney();
  const conflict = journeyFindings(preview).some(
    (finding) => finding.kind === 'conflict' && finding.legIds.includes(leg.id)
  );
  return (
    <article
      aria-label={legLabel(state, leg)}
      className={cn(
        'group space-y-2 rounded-xl border border-dashed border-foreground/30 bg-muted/60 p-3 shadow-sm',
        leg.status === 'Purchased' && 'border-solid border-l-4 border-l-app-accent',
        conflict && 'border-destructive bg-destructive/10'
      )}
    >
      <header className="flex flex-wrap items-center gap-1">
        <GripVertical
          className="size-4 shrink-0 text-foreground/70 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
          aria-hidden
        />
        <LegMode leg={leg} />
        <span className="flex-1 text-sm font-medium">{durationLabel(legMinutes(leg))}</span>
        <LegStatus leg={leg} />
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Remove ${legLabel(state, leg)}`}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
          onClick={() => change(removeLeg(state, leg.id))}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </header>
      <JourneyEndpoints leg={leg} />
      <LegMetadata leg={leg} />
    </article>
  );
}

function Connection({ previous, next }: { previous: JourneyLeg; next: JourneyLeg }) {
  const { state } = useJourney();
  const minutes = connectionMinutes(previous, next);
  if (minutes === undefined || minutes < 0) return null;
  const same = previous.to.locationId === next.from.locationId;
  return (
    <div className="flex gap-5">
      <aside className="w-24 shrink-0 border-r-2 border-dotted border-app-accent/50 sm:w-28" />
      <p className="py-3 text-sm text-foreground/85">
        {same
          ? endpointLabel(state, previous.to)
          : `${endpointLabel(state, previous.to)} → ${endpointLabel(state, next.from)}`}{' '}
        · {durationLabel(minutes)}
      </p>
    </div>
  );
}
