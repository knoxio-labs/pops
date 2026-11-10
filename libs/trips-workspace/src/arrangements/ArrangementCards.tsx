import { BedDouble, CalendarDays, CarFront, Route } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { ContactReference } from './ContactReference';
import { purchased } from './projection';
import { arrangementTitle } from './source-labels';
import { JourneySummary, RentalTimeline, RowStates } from './SourceSummary';

import type { JSX } from 'react';

import type { ArrangementRow, ArrangementSources, ArrangementsWorkspaceProps } from './types';

/** Source kind alone chooses the icon; open transport modes never imply an unconfigured icon mapping. */
export function ArrangementCard({
  row,
  sources,
  identity,
  open,
}: {
  row: ArrangementRow;
  sources: ArrangementSources;
  identity: ArrangementsWorkspaceProps;
  open: () => void;
}): JSX.Element {
  const { labels, formatDate } = identity;
  const Icon = { stay: BedDouble, event: CalendarDays, rental: CarFront, journey: Route }[row.kind];
  const name = arrangementTitle(row, labels);
  const { start, end } = rowDates(row);
  return (
    <article
      className="flex min-w-0 gap-3"
      aria-label={name}
      data-source-kind={row.kind}
      data-source-id={row.source.id}
    >
      <div className="w-20 shrink-0 pt-3 text-right text-xs text-muted-foreground">
        {start && <p>{formatDate(start)}</p>}
        {end && <p>{formatDate(end)}</p>}
      </div>
      <div className="relative min-w-0 flex-1 border-l border-dotted border-border pb-3 pl-4">
        <Icon
          aria-hidden
          className="absolute -left-3 top-3 size-5 bg-background text-muted-foreground"
        />
        <Button
          variant="ghost"
          onClick={open}
          className={cn(
            'block h-auto min-h-11 w-full whitespace-normal rounded-lg border border-dashed border-border p-3 text-left font-normal',
            purchased(row) && 'border-solid border-l-4 border-l-app-accent'
          )}
        >
          <span className="block break-words text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">{labels[row.kind]}</span>
          <RowStates row={row} identity={identity} />
          <OwnerSummary row={row} sources={sources} identity={identity} />
          {row.kind === 'rental' && (
            <RentalTimeline rental={row.source} sources={sources} identity={identity} />
          )}
          {row.kind === 'journey' && <JourneySummary row={row} identity={identity} />}
        </Button>
      </div>
    </article>
  );
}
function OwnerSummary({
  row,
  sources,
  identity,
}: {
  row: ArrangementRow;
  sources: ArrangementSources;
  identity: ArrangementsWorkspaceProps;
}): JSX.Element | null {
  const owner = sources.responsibilities?.find(
    (value) => value.targetKind === row.kind && value.targetId === row.source.id
  )?.responsibility;
  if (!owner) return null;
  return (
    <span className="mt-1 block break-all text-xs text-muted-foreground">
      {identity.labels.handledBy}{' '}
      {owner.kind === 'self' ? (
        identity.labels.self
      ) : (
        <ContactReference identity={identity} uri={owner.uri} />
      )}
    </span>
  );
}
function rowDates(row: ArrangementRow): { start?: string | null; end?: string | null } {
  switch (row.kind) {
    case 'stay':
      return { start: row.source.timing.arrival, end: row.source.timing.departure };
    case 'event':
      return { start: row.source.timing.start, end: row.source.timing.end };
    case 'rental':
      return { start: row.source.start, end: row.source.end };
    case 'journey':
      return {
        start: row.legs?.at(0)?.from.local?.slice(0, 10),
        end: row.legs?.at(-1)?.to.local?.slice(0, 10),
      };
  }
}
