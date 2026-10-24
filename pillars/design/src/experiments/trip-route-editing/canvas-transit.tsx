import { presentTripRecord } from '@/fixtures/trip-overview-format';
import { isPurchasedArrangement, tripItemTier } from '@/fixtures/trip-overview-model';
import { Car, Plane, GripVertical } from 'lucide-react';

import { Badge, Button, Popover, PopoverContent, PopoverTrigger, TextInput, cn } from '@pops/ui';

import { BookingFindings, BookingTimes } from './canvas-booking-times';
import { useCanvas } from './canvas-context';
import { CanvasInsert } from './canvas-insert';
import { transportIssues, transportMissing } from './canvas-issues';
import { canvasName } from './canvas-model';
import { CanvasVisitEndpoint, TransportFields, TransportName } from './canvas-transport-fields';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { RentalPeriod } from './canvas-model';

/** Journeys are route nodes between visits, with unchanged purchased times and destinations. */
export function TransitCard({ record }: { record: TripRecord }) {
  const { state, preview } = useCanvas();
  const display = presentTripRecord(record, state.records);
  const issues = transportIssues(preview, record);
  return (
    <section
      data-canvas-id={record.id}
      aria-label={record.title ?? display.title}
      className={cn(
        'group/transit mx-6 space-y-2 rounded-xl border bg-card p-4',
        isPurchasedArrangement(record) ? 'border-l-4 border-l-app-accent' : 'border-dashed',
        issues.length > 0 && 'border-destructive bg-destructive/10'
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <GripVertical
          className="size-4 cursor-grab opacity-0 group-hover/transit:opacity-100 group-focus-within/transit:opacity-100"
          aria-hidden
        />
        <Plane className="size-5" aria-hidden />
        <TransportName record={record} />
        <Badge variant={isPurchasedArrangement(record) ? 'default' : 'outline'}>
          {tripItemTier(record)}
        </Badge>
      </div>
      {display.when && <p className="text-sm">{display.when}</p>}
      <TransportFields record={record} />
      <BookingTimes recordId={record.id} />
      <BookingFindings recordId={record.id} />
      {issues.map((issue) => (
        <p key={issue} className="text-sm font-medium text-foreground">
          {issue}
        </p>
      ))}
    </section>
  );
}

/** Missing journeys are derived from adjacent visits, arranged transport and active car hires. */
export function MissingTransit({ from }: { from: string }) {
  const { state } = useCanvas();
  const index = state.order.indexOf(from);
  const a = state.records.find((r) => r.id === from);
  const next = state.order
    .slice(index + 1)
    .map((id) => state.records.find((r) => r.id === id))
    .find((r) => r?.kind === 'city' || r?.kind === 'gap');
  if (a?.kind !== 'city' || next?.kind !== 'city' || !transportMissing(state, from, next.id))
    return null;
  return (
    <div className="mx-6 flex flex-wrap items-center gap-3 rounded-lg border border-warning/60 bg-warning/10 px-4">
      <Plane className="size-4" aria-hidden />
      <span className="text-sm">
        {canvasName(state, a)} → {canvasName(state, next)} · Transport needed
      </span>
      <CanvasInsert
        line={false}
        label="Add transport"
        defaultKind="transport"
        target={{ after: from }}
      />
    </div>
  );
}

interface RentalEditorProps {
  rental: RentalPeriod;
  update: (rental: RentalPeriod) => void;
}

function RentalStatus({ rental, update }: RentalEditorProps) {
  const statuses: RentalPeriod['status'][] = ['Considering', 'Reserved', 'Purchased'];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="min-h-11" aria-label="Rental status">
          <Badge variant="outline">{rental.status}</Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-1">
        {statuses.map((status) => (
          <Button
            key={status}
            variant={status === rental.status ? 'secondary' : 'ghost'}
            onClick={() => update({ ...rental, status })}
          >
            {status}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function RentalDates({ rental, update }: RentalEditorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextInput
        label="Pickup"
        type="date"
        value={rental.start}
        onInput={(event) => update({ ...rental, start: event.currentTarget.value })}
      />
      <TextInput
        label="Return"
        type="date"
        value={rental.end}
        onInput={(event) => update({ ...rental, end: event.currentTarget.value })}
      />
    </div>
  );
}

function RentalProvider({ rental, update }: RentalEditorProps) {
  return (
    <TextInput
      key={rental.provider}
      aria-label="Rental provider"
      variant="ghost"
      defaultValue={rental.provider}
      onBlur={(event) => update({ ...rental, provider: event.currentTarget.value })}
    />
  );
}

function RentalCard({ rental }: { rental: RentalPeriod }) {
  const { state, change, preview } = useCanvas();
  const fromIndex = preview.order.indexOf(rental.from);
  const toIndex = preview.order.indexOf(rental.to);
  const dateConflict = Boolean(rental.start && rental.end && rental.start > rental.end);
  const routeConflict = fromIndex >= 0 && toIndex >= 0 && fromIndex > toIndex;
  const invalid = dateConflict || routeConflict;
  const update = (next: RentalPeriod): void =>
    change({
      ...state,
      rentals: state.rentals.map((item) => (item.id === rental.id ? next : item)),
    });
  return (
    <section
      aria-label="Car rental"
      className={cn(
        'mx-6 space-y-3 rounded-xl border bg-muted/30 p-4',
        rental.status === 'Purchased'
          ? 'border-solid border-l-4 border-l-app-accent'
          : 'border-dashed',
        invalid && 'border-destructive bg-destructive/10'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Car className="size-5" aria-hidden />
        <RentalProvider rental={rental} update={update} />
        <RentalStatus rental={rental} update={update} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CanvasVisitEndpoint
          value={rental.from}
          label="Pickup visit"
          onChange={(from) => update({ ...rental, from })}
        />
        <span aria-hidden>→</span>
        <CanvasVisitEndpoint
          value={rental.to}
          label="Return visit"
          onChange={(to) => update({ ...rental, to })}
        />
      </div>
      <RentalDates rental={rental} update={update} />
      {dateConflict && (
        <p role="alert" className="text-sm text-foreground">
          Pickup is after return
        </p>
      )}
      {routeConflict && (
        <p role="alert" className="text-sm text-foreground">
          Check rental visit order
        </p>
      )}
    </section>
  );
}

/** Render hires at their pickup visit, exposing unknown or unplaced pickups at the root. */
export function RentalSections({ visitId }: { visitId: string }) {
  const { state } = useCanvas();
  return state.rentals
    .filter(
      (rental) => rental.from === visitId || (visitId === '' && !state.order.includes(rental.from))
    )
    .map((rental) => <RentalCard key={rental.id} rental={rental} />);
}
