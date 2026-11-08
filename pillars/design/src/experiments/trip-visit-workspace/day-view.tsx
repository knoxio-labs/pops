import { formatTripDate } from '@/fixtures/trip-overview-format';
import { BedDouble, Car } from 'lucide-react';

import { TextInput, cn } from '@pops/ui';

import { AccommodationStay } from '../trip-route-editing/accommodation-stay';
import { useCanvas } from '../trip-route-editing/canvas-context';
import { CanvasInsert } from '../trip-route-editing/canvas-insert';
import { ActivityCard } from '../trip-route-editing/canvas-items';
import { RentalEditor } from '../trip-route-editing/canvas-rentals';
import { DayEntries, DayRow } from './day-entries';
import { visitDay } from './day-model';
import { VisitTransport } from './period-view';

import type { TripDate, TripRecord } from '@/fixtures/trip-overview-model';

import type { RentalPeriod } from '../trip-route-editing/canvas-model';
import type { AccommodationPeriod } from '../trip-route-editing/lodging-periods';
import type { VisitDayRental } from './day-model';

function DayAccommodation({
  period,
  visit,
  day,
  arrivals,
}: {
  period: AccommodationPeriod;
  visit: TripRecord;
  day: TripDate;
  arrivals: string[];
}) {
  const stays = period.stays.filter((stay) => !arrivals.includes(stay.id));
  if (!stays.length && !period.missing) return null;
  return (
    <DayRow marker="Night" icon={<BedDouble className="size-3" />}>
      {stays.map((stay) => (
        <AccommodationStay key={stay.id} stay={stay} />
      ))}
      {period.missing && (
        <div className="w-full">
          <CanvasInsert
            target={{ visitId: visit.id, start: day, end: period.end }}
            label={`Add accommodation for ${formatTripDate(day)}`}
            defaultKind="stay"
            slotLabel="Accommodation"
          />
        </div>
      )}
    </DayRow>
  );
}

function DayRental({ entry }: { entry: VisitDayRental }) {
  const { state, change } = useCanvas();
  const { rental, boundary } = entry;
  const update = (next: RentalPeriod): void =>
    change({ ...state, rentals: state.rentals.map((item) => (item.id === next.id ? next : item)) });
  return (
    <DayRow marker={boundary} icon={<Car className="size-3" />}>
      <div
        className={cn(
          'flex min-h-11 items-center gap-2 border-l-2 border-transparent pl-2',
          rental.status === 'Purchased' && 'border-l-app-accent'
        )}
      >
        <TextInput
          key={rental.provider}
          aria-label="Rental provider"
          variant="ghost"
          defaultValue={rental.provider}
          containerClassName="min-w-0 flex-1 bg-transparent px-0"
          onBlur={(event) => update({ ...rental, provider: event.currentTarget.value })}
        />
        <span className="text-xs">{rental.status}</span>
        <RentalEditor rental={rental} update={update} />
      </div>
    </DayRow>
  );
}

/** Editable local-day projection of the shared visit; optional undated items render only once. */
export function VisitDays({
  visit,
  day,
  includeUndated = false,
}: {
  visit: TripRecord;
  day: TripDate;
  includeUndated?: boolean;
}) {
  const { state } = useCanvas();
  const projection = visitDay(state, visit, day);
  return (
    <section aria-label={`Plan for ${formatTripDate(day)}`}>
      {visit.timing?.arrival === day && (
        <VisitTransport visit={visit} boundary="arrival" missingOnly />
      )}
      {projection.rentals.map((entry) => (
        <DayRental key={`${entry.rental.id}:${entry.boundary}`} entry={entry} />
      ))}
      <DayEntries key={`${visit.id}:${day}`} entries={projection.entries} visit={visit} day={day} />
      <DayRow marker={null}>
        <CanvasInsert
          target={{ visitId: visit.id, start: day }}
          label={`Add activity on ${formatTripDate(day)}`}
          defaultKind="idea"
          line={false}
        />
      </DayRow>
      {projection.accommodation && (
        <DayAccommodation
          period={projection.accommodation}
          visit={visit}
          day={day}
          arrivals={projection.entries
            .filter((entry) => entry.stayBoundary === 'Check-in')
            .map((entry) => entry.record.id)}
        />
      )}
      {visit.timing?.departure === day && (
        <VisitTransport visit={visit} boundary="departure" missingOnly />
      )}
      {includeUndated && projection.undated.length > 0 && (
        <DayRow marker="Undated">
          {projection.undated.map((item) => (
            <ActivityCard key={item.id} item={item} visit={visit} />
          ))}
        </DayRow>
      )}
    </section>
  );
}
