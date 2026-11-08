import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, TextInput } from '@pops/ui';

import { isTripDate } from '../trip-route-editing/lodging-periods';

import type { TripDate } from '@/fixtures/trip-overview-model';

/** Day selection is a projection only, and accepts any valid date beyond the navigation shortcuts. */
export function VisitToolbar({
  day,
  days,
  setDay,
}: {
  day: TripDate | null;
  days: TripDate[];
  setDay: (day: TripDate | null) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted p-2"
      role="group"
      aria-label="Visit granularity"
    >
      <Button
        variant={day === null ? 'secondary' : 'ghost'}
        className={
          day === null
            ? 'border border-app-accent/50 bg-app-accent/15 font-semibold text-foreground shadow-sm'
            : undefined
        }
        aria-pressed={day === null}
        onClick={() => setDay(null)}
      >
        Whole visit
      </Button>
      <Button
        variant={day !== null ? 'secondary' : 'ghost'}
        className={
          day !== null
            ? 'border border-app-accent/50 bg-app-accent/15 font-semibold text-foreground shadow-sm'
            : undefined
        }
        aria-pressed={day !== null}
        disabled={day === null && days.length === 0}
        onClick={() => setDay(day ?? days[0] ?? null)}
      >
        <CalendarDays className="size-4 text-app-accent" aria-hidden />
        Day
      </Button>
      {day && <DayNavigation day={day} days={days} setDay={setDay} />}
    </div>
  );
}

function DayNavigation({
  day,
  days,
  setDay,
}: {
  day: TripDate;
  days: TripDate[];
  setDay: (day: TripDate) => void;
}) {
  const index = days.indexOf(day);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous day"
        disabled={index <= 0}
        onClick={() => setDay(days[index - 1] ?? day)}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <div className="w-44">
        <TextInput
          aria-label="Selected day"
          type="date"
          value={day}
          onInput={(e) => {
            if (isTripDate(e.currentTarget.value)) setDay(e.currentTarget.value);
          }}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next day"
        disabled={index < 0 || index >= days.length - 1}
        onClick={() => setDay(days[index + 1] ?? day)}
      >
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </>
  );
}
