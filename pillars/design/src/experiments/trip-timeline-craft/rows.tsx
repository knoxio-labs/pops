import { formatTripDate } from '@/fixtures/trip-overview-format';
import { tripPlaceName } from '@/fixtures/trip-places';
import { ChevronRight, CircleHelp, MapPin, Plus } from 'lucide-react';

import { Button } from '@pops/ui';

import { ActivityRow, CraftThoughtRow, StayRow } from './arrangement-rows';
import { CraftNotes, RailRow } from './row-primitives';

import type {
  CraftAccommodationGap,
  CraftStay,
  CraftThought,
  CraftVisit,
  CraftVisitItem,
} from '@/fixtures/trip-timeline-craft';

import type { CraftRowActions } from './model';

export { ArrangementMark, CraftNotes } from './row-primitives';
export { CraftFlightRow } from './flight-row';
export { CraftThoughtRow } from './arrangement-rows';
export type { CraftDetailSource, CraftRowActions } from './model';

function visitDate(visit: CraftVisit) {
  if (visit.arrival) return formatTripDate(visit.arrival);
  if (visit.departure) return `Until ${formatTripDate(visit.departure)}`;
  return 'Dates open';
}

function VisitHeading({ visit, onOpen }: { visit: CraftVisit; onOpen: CraftRowActions['onOpen'] }) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
        <h2 className="text-xl font-semibold tracking-tight">{tripPlaceName(visit.placeId)}</h2>
        <Button
          variant="ghost"
          className="min-h-11 gap-1 px-0 text-sm text-muted-foreground"
          onClick={() => onOpen(visit)}
        >
          Visit details <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
      {visit.arrival && visit.departure && (
        <p className="mb-4 text-sm text-muted-foreground">
          {formatTripDate(visit.arrival)} – {formatTripDate(visit.departure)}
        </p>
      )}
    </>
  );
}

/** Place anchors carry source bounds; source items retain their own independent presentation. */
export function CraftVisitRow(
  props: CraftRowActions & {
    visit: CraftVisit;
    addedItems: readonly (CraftThought | CraftStay)[];
    showIdeas: boolean;
  }
) {
  const { visit, addedItems } = props;
  return (
    <RailRow date={visitDate(visit)} icon={<MapPin className="size-5" aria-hidden />}>
      <VisitHeading visit={visit} onOpen={props.onOpen} />
      <div className="space-y-2">
        {[...visit.items, ...addedItems].map((item) => (
          <CraftVisitItemRow key={item.id} {...props} item={item} />
        ))}
      </div>
      {visit.coverage === 'unknown' && (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
          Accommodation coverage unknown
        </p>
      )}
      <CraftNotes>{visit.notes}</CraftNotes>
    </RailRow>
  );
}

function AccommodationGap({
  gap,
  visit,
  onAddStay,
}: {
  gap: CraftAccommodationGap;
  visit: CraftVisit;
  onAddStay: CraftRowActions['onAddStay'];
}) {
  return (
    <div className="my-4 flex flex-wrap items-center justify-between gap-3 border-l-2 border-dotted border-warning/70 py-3 pl-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">Accommodation needed</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatTripDate(gap.start)} – {formatTripDate(gap.end)}
        </p>
      </div>
      <Button
        variant="outline"
        className="min-h-11 gap-1 text-sm"
        onClick={() => onAddStay(visit, gap)}
      >
        <Plus className="size-4" aria-hidden />
        Add stay
      </Button>
    </div>
  );
}

/** Hide Considering activities and stays consistently; known gaps and unknown states remain visible. */
export function CraftVisitItemRow({
  item,
  visit,
  showIdeas,
  onOpen,
  onAddStay,
}: CraftRowActions & {
  item: CraftVisitItem;
  visit: CraftVisit;
  showIdeas: boolean;
}) {
  switch (item.kind) {
    case 'stay':
      if (!showIdeas && item.state === 'Considering') return null;
      return <StayRow stay={item} onOpen={onOpen} />;
    case 'activity':
      if (!showIdeas && item.state === 'Considering') return null;
      return <ActivityRow activity={item} onOpen={onOpen} />;
    case 'thought':
      return showIdeas ? <CraftThoughtRow thought={item} /> : null;
    case 'accommodation-gap':
      return <AccommodationGap gap={item} visit={visit} onAddStay={onAddStay} />;
  }
}
