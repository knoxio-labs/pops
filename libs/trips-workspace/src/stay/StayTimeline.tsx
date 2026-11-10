import { BedDouble } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import { calendarNights, neighbouringStays } from './model';

import type { JSX } from 'react';
import type { ReactNode } from 'react';

import type { Stay } from './types';

/** Accommodation context uses only explicit same-visit sources; the selected stay remains editable. */
export function StayTimeline({
  stay,
  stays,
  children,
  formatNights,
}: {
  stay: Stay;
  stays: Stay[];
  children: ReactNode;
  formatNights: (count: number) => string;
}): JSX.Element {
  const periods = [stay, ...neighbouringStays(stay, stays)].toSorted((left, right) => {
    const arrivalOrder = (left.timing.arrival ?? '').localeCompare(right.timing.arrival ?? '');
    return arrivalOrder || left.id - right.id;
  });
  return (
    <section aria-label="Accommodation timeline" className="space-y-4">
      {periods.map((period) => (
        <div key={period.id} className="flex gap-3">
          <div className="flex w-24 shrink-0 flex-col gap-2 pt-3 text-right text-sm text-muted-foreground">
            {period.timing.arrival && (
              <time dateTime={period.timing.arrival}>{period.timing.arrival}</time>
            )}
            {period.timing.departure && (
              <time dateTime={period.timing.departure}>{period.timing.departure}</time>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center pt-3">
            <BedDouble className="size-4 text-app-accent" aria-hidden />
            <div className="grow border-l border-dotted border-app-accent/50" />
          </div>
          <article
            aria-label={period.id === stay.id ? 'Stay editor' : `Neighbouring stay ${period.id}`}
            className={cn(
              'min-w-0 flex-1 space-y-4 rounded-xl border bg-muted/40 p-4',
              period.status === 'Purchased' ? 'border-l-4 border-l-app-accent' : 'border-dashed'
            )}
          >
            {period.id === stay.id ? (
              children
            ) : (
              <h2 className="font-medium">{period.name ?? `Stay ${period.id}`}</h2>
            )}
            <NightCount stay={period} formatNights={formatNights} />
          </article>
        </div>
      ))}
    </section>
  );
}

function NightCount({
  stay,
  formatNights,
}: {
  stay: Stay;
  formatNights: (count: number) => string;
}): JSX.Element | null {
  const count = calendarNights(stay.timing);
  return count === undefined ? null : <Badge variant="outline">{formatNights(count)}</Badge>;
}
