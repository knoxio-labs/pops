import { Temporal } from '@js-temporal/polyfill';
import { BedDouble, CalendarDays, Route } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { displayDate } from './time';

import type { JSX } from 'react';

import type { CalendarEntry, CalendarSource } from './types';

const icons = { journey: Route, stay: BedDouble, event: CalendarDays };
const boundaries = {
  departure: 'Departure',
  arrival: 'Arrival',
  checkIn: 'Check-in',
  checkOut: 'Check-out',
  start: 'Start',
  end: 'End',
  unknown: 'Timing unknown',
};

/** Dotted display-clock rail with direct source opening and independent original clocks. */
export function CalendarRows({
  entries,
  zone,
  locale,
  onOpenSource,
}: {
  entries: CalendarEntry[];
  zone: string;
  locale: string;
  onOpenSource: (source: CalendarSource) => void;
}): JSX.Element {
  const days = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const date =
      entry.placementDate ??
      (entry.instant === null ? (entry.date ?? '') : displayDate(entry.instant, zone));
    const rows = days.get(date) ?? [];
    rows.push(entry);
    days.set(date, rows);
  }
  return (
    <section aria-label="Calendar results" className="space-y-5">
      {[...days].map(([date, rows]) => (
        <section key={date} aria-label={date || 'Date unknown'}>
          <h2 className="border-b border-border pb-2 text-base font-semibold">
            {date
              ? Temporal.PlainDate.from(date).toLocaleString(locale, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Date unknown'}
          </h2>
          {rows.map((entry) => (
            <CalendarRow
              key={entry.key}
              entry={entry}
              zone={zone}
              locale={locale}
              onOpenSource={onOpenSource}
            />
          ))}
        </section>
      ))}
    </section>
  );
}

function CalendarRow({
  entry,
  zone,
  locale,
  onOpenSource,
}: {
  entry: CalendarEntry;
  zone: string;
  locale: string;
  onOpenSource: (source: CalendarSource) => void;
}): JSX.Element {
  const Icon = icons[entry.source.kind];
  const clock =
    entry.instant === null || entry.continuing
      ? '—'
      : new Intl.DateTimeFormat(locale, {
          timeZone: zone,
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(entry.instant));
  return (
    <div className="flex gap-4">
      <aside className="relative w-16 shrink-0 border-r-2 border-dotted border-app-accent/60 pr-4 pt-5 text-right font-mono text-xs tabular-nums sm:w-20">
        <span
          aria-label={
            entry.instant === null || entry.continuing
              ? 'Display time unresolved'
              : `Display time ${clock}`
          }
        >
          {clock}
        </span>
        <span className="absolute -right-3 top-4 flex size-6 items-center justify-center rounded-full bg-app-accent text-app-accent-foreground">
          <Icon className="size-3" aria-hidden />
        </span>
      </aside>
      <Button
        aria-label={`${entry.title || `${entry.source.kind} ${entry.source.id}`} ${boundaries[entry.boundary]}`}
        variant="ghost"
        className={cn(
          'my-2 h-auto min-h-11 min-w-0 flex-1 justify-start whitespace-normal rounded-xl border border-border p-3 text-left',
          entry.purchased ? 'border-solid' : 'border-dashed',
          entry.conflict && 'border-destructive'
        )}
        onClick={() => onOpenSource(entry.source)}
      >
        <span className="min-w-0 space-y-1">
          <SourceSummary entry={entry} />
        </span>
      </Button>
    </div>
  );
}

function SourceSummary({ entry }: { entry: CalendarEntry }): JSX.Element {
  return (
    <>
      <span className="block break-words text-sm font-semibold">
        {entry.title || `${entry.source.kind} ${entry.source.id}`}
      </span>
      <span className="block text-xs font-normal text-muted-foreground">
        {entry.continuing ? 'Continuing' : boundaries[entry.boundary]} ·{' '}
        {entry.facts.join(' · ') || 'Source facts not captured'}
      </span>
      <OriginalClock entry={entry} />
      {entry.endDate && (
        <span className="block text-xs font-normal text-muted-foreground">
          Through {entry.endDate}
          {entry.endExclusive ? ' (end exclusive)' : ''}
        </span>
      )}
      {entry.instant === null && (
        <span className="block text-xs font-normal text-muted-foreground">
          {entry.date && !entry.clock ? 'Floating date' : 'Unresolved time'}
        </span>
      )}
      {entry.conflict && (
        <span className="block text-xs font-normal text-destructive">
          Timing issue — open the source
        </span>
      )}
    </>
  );
}

function OriginalClock({ entry }: { entry: CalendarEntry }): JSX.Element {
  return (
    <span className="block break-words text-xs font-normal text-muted-foreground">
      {[
        entry.date ?? 'Date unknown',
        entry.clock ?? 'Time unknown',
        entry.zone ?? 'Zone unknown',
      ].join(' · ')}
    </span>
  );
}
