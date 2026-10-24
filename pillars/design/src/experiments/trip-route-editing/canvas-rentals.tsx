import { formatTripDate } from '@/fixtures/trip-overview-format';
import { Car, CornerDownLeft, Pencil } from 'lucide-react';

import { Badge, Button, Popover, PopoverContent, PopoverTrigger, TextInput, cn } from '@pops/ui';

import { useCanvas } from './canvas-context';
import { validCanvasTarget } from './canvas-graph';
import { CanvasVisitEndpoint } from './canvas-transport-fields';
import { isTripDate } from './lodging-periods';

import type { CanvasState, RentalPeriod } from './canvas-model';

interface RentalEditorProps {
  rental: RentalPeriod;
  update: (rental: RentalPeriod) => void;
}

function rentalDate(value: string): string {
  return isTripDate(value) ? formatTripDate(value) : value;
}

function knownVisit(state: CanvasState, id: string): boolean {
  return Boolean(id) && validCanvasTarget(state, { visitId: id });
}

function rentalDateIssues(rental: RentalPeriod): string[] {
  const issues: string[] = [];
  if (!rental.start) issues.push('Add pickup date');
  if (!rental.end) issues.push('Add return date');
  const invalid = [rental.start, rental.end].some((value) => value !== '' && !isTripDate(value));
  if (invalid) issues.push('Check rental dates');
  if (rental.start && rental.end && !invalid && rental.start > rental.end)
    issues.push('Pickup is after return');
  return issues;
}

function rentalIssues(state: CanvasState, rental: RentalPeriod): string[] {
  const issues: string[] = [];
  if (!knownVisit(state, rental.from)) issues.push('Set pickup visit');
  if (!knownVisit(state, rental.to)) issues.push('Set return visit');
  issues.push(...rentalDateIssues(rental));
  const from = state.order.indexOf(rental.from);
  const to = state.order.indexOf(rental.to);
  if (from >= 0 && to >= 0 && from > to) issues.push('Check rental visit order');
  return issues;
}

function RentalDates({ rental, update }: RentalEditorProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
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

function RentalEditor({ rental, update }: RentalEditorProps) {
  const statuses: RentalPeriod['status'][] = ['Considering', 'Reserved', 'Purchased'];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="size-11 shrink-0 p-0" aria-label="Edit rental">
          <Pencil className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <RentalDates rental={rental} update={update} />
        <div className="flex flex-wrap gap-2">
          <CanvasVisitEndpoint
            value={rental.from}
            label="Pickup visit"
            onChange={(from) => update({ ...rental, from })}
          />
          <CanvasVisitEndpoint
            value={rental.to}
            label="Return visit"
            onChange={(to) => update({ ...rental, to })}
          />
        </div>
        <div role="group" aria-label="Rental status" className="flex flex-wrap gap-1">
          {statuses.map((status) => (
            <Button
              key={status}
              aria-pressed={status === rental.status}
              variant={status === rental.status ? 'secondary' : 'ghost'}
              onClick={() => update({ ...rental, status })}
            >
              {status}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RentalPickup({ rental }: { rental: RentalPeriod }) {
  const { state, change, preview } = useCanvas();
  const issues = rentalIssues(preview, rental);
  const update = (next: RentalPeriod): void =>
    change({
      ...state,
      rentals: state.rentals.map((item) => (item.id === rental.id ? next : item)),
    });
  return (
    <section
      aria-label="Car rental"
      className={cn(
        'border-l pl-3',
        rental.status === 'Purchased' ? 'border-solid border-l-app-accent' : 'border-dashed'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Car className="size-4 shrink-0" aria-hidden />
        <TextInput
          key={rental.provider}
          aria-label="Rental provider"
          variant="ghost"
          defaultValue={rental.provider}
          containerClassName="min-w-0 flex-1 bg-transparent px-0 hover:bg-accent/40 focus-within:bg-accent/40"
          className="min-w-0 w-full bg-transparent"
          onBlur={(event) => update({ ...rental, provider: event.currentTarget.value })}
        />
        <Badge variant="outline">{rental.status}</Badge>
        <RentalEditor rental={rental} update={update} />
      </div>
      {(rental.start || rental.end) && (
        <p className="text-xs text-muted-foreground">
          {rentalDate(rental.start)}
          {rental.start && rental.end && ' → '}
          {rentalDate(rental.end)}
        </p>
      )}
      {issues.map((issue) => (
        <p key={issue} role="status" className="text-xs text-muted-foreground">
          {issue}
        </p>
      ))}
    </section>
  );
}

function RentalReturn({ rental }: { rental: RentalPeriod }) {
  return (
    <div
      role="note"
      aria-label="Car rental return"
      className="flex min-h-11 items-center gap-2 border-l border-dashed pl-3 text-xs text-muted-foreground"
    >
      <CornerDownLeft className="size-4 shrink-0" aria-hidden />
      <span>Return {rental.provider}</span>
      <span>{rentalDate(rental.end) || 'Add return date'}</span>
    </div>
  );
}

/** Render compact pickup details, short return markers, and recoverable unknown pickups. */
export function RentalSections({ visitId }: { visitId: string }) {
  const { state } = useCanvas();
  return state.rentals.flatMap((rental) => {
    const pickup = rental.from === visitId || (visitId === '' && !knownVisit(state, rental.from));
    const returning = visitId !== '' && rental.to === visitId;
    return [
      pickup && <RentalPickup key={`${rental.id}:pickup`} rental={rental} />,
      returning && <RentalReturn key={`${rental.id}:return`} rental={rental} />,
    ];
  });
}
