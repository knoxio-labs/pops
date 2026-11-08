import { formatTripDate } from '@/fixtures/trip-overview-format';
import { BedDouble, CalendarDays } from 'lucide-react';

import { isTripDate } from '../trip-route-editing/lodging-periods';
import { useStay } from './context';
import { StayEditor } from './editor';

import type { ReactNode } from 'react';

/** Main dates use a dotted left rail; neighbouring stays retain their own source intervals. */
export function StayTimeline({ includeEditor }: { includeEditor: boolean }) {
  const { state } = useStay();
  const periods = [
    ...state.adjacent.map((period) => ({ ...period, current: false })),
    ...(includeEditor
      ? [{ id: 'current', name: state.name, from: state.from, to: state.to, current: true }]
      : []),
  ].toSorted((a, b) => a.from.localeCompare(b.from));
  return (
    <section aria-label="Accommodation timeline" className="space-y-3">
      {periods.map((period) => (
        <TimelineRow key={period.id} from={period.from} to={period.to}>
          {period.current ? (
            <StayEditor />
          ) : (
            <div className="rounded-lg border border-dashed border-foreground/25 bg-muted/40 p-3">
              <h3 className="text-base font-medium">{period.name}</h3>
            </div>
          )}
        </TimelineRow>
      ))}
      {state.activities.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <h2 className="text-sm font-semibold">Visit activities</h2>
          {state.activities.map((activity) => (
            <div key={activity.id} className="flex flex-wrap items-center gap-3 py-1 text-sm">
              <CalendarDays className="size-4 text-app-accent" aria-hidden />
              <time dateTime={activity.local} className="text-muted-foreground">
                {activityTime(activity.local)}
              </time>
              <span>{activity.title}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A source interval beside a compact stay card, with no copy for unknown bounds. */
export function TimelineRow({
  from,
  to,
  children,
}: {
  from: string;
  to: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex w-16 shrink-0 flex-col sm:w-24 items-end gap-1 pt-3 text-right text-sm font-medium">
        {isTripDate(from) && <time dateTime={from}>{formatTripDate(from)}</time>}
        {isTripDate(to) && <time dateTime={to}>{formatTripDate(to)}</time>}
      </div>
      <div className="flex shrink-0 flex-col items-center">
        <span className="flex size-9 items-center justify-center rounded-full border border-app-accent/40 bg-app-accent/20 text-app-accent">
          <BedDouble className="size-4" aria-hidden />
        </span>
        <div className="grow border-l border-dotted border-app-accent/50" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function activityTime(local: string): string {
  const day = local.slice(0, 10);
  return isTripDate(day)
    ? [formatTripDate(day), local.slice(11)].filter(Boolean).join(' · ')
    : local;
}
