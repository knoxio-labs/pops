import { AlertTriangle, CalendarCheck, CalendarDays, Check, CircleHelp, X } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import { shortArrangementDates } from '../trip-arrangements/format';

import type { PeopleRow } from './model';

/** Keeps intention, agreement and exact source availability as separate evidence rather than a task tier. */
export function MeetingStatus({ row }: { row: PeopleRow }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          'text-xs',
          row.plan.intention === 'Considering' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {row.plan.intention}
      </span>
      {row.plan.agreement === 'Agreed' ? (
        <Badge variant="secondary" className="gap-1 bg-app-accent/15 text-app-accent">
          <Check className="size-3" aria-hidden />
          Agreed meeting
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">Not agreed</span>
      )}
      {row.availability.map((entry) => (
        <AvailabilityStatus key={entry.source.id} entry={entry} />
      ))}
    </span>
  );
}

function AvailabilityStatus({ entry }: { entry: PeopleRow['availability'][number] }) {
  let Icon = CalendarDays;
  if (entry.source.status === 'Available') Icon = CalendarCheck;
  else if (entry.source.status === 'Unavailable') Icon = X;
  else if (entry.source.status === 'Unknown') Icon = CircleHelp;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        entry.source.status === 'Unavailable' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {entry.source.status} · {shortArrangementDates([entry.from, entry.to])}
    </span>
  );
}

/** Shows actual incompatibilities without turning absence of availability into missing work. */
export function MeetingFindings({ row }: { row: PeopleRow }) {
  return row.findings.length ? (
    <span className="mt-1 flex items-start gap-1 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{row.findings.map((finding) => finding.message).join(' ')}</span>
    </span>
  ) : null;
}
