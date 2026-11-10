import { Badge, cn } from '@pops/ui';

import { visitTitle } from './source-labels';

import type { JSX } from 'react';

import type { ArrangementRow, ArrangementSources, ArrangementsWorkspaceProps } from './types';

type Identity = ArrangementsWorkspaceProps;
/** Preserve each Journey leg's independent source axes and clocks without inventing a whole-Journey purchase. */
export function JourneySummary({
  row,
  identity,
}: {
  row: Extract<ArrangementRow, { kind: 'journey' }>;
  identity: Identity;
}): JSX.Element {
  return (
    <>
      {row.legs?.map((leg, index) => (
        <span
          key={leg.id}
          className={cn(
            'mt-3 block border-l border-dashed border-border pl-3',
            leg.purchase === 'Purchased' && 'border-solid border-l-4 border-l-app-accent'
          )}
        >
          <span className="block text-sm">
            {leg.mode ?? identity.labels.journey} · {index + 1}
          </span>
          {(Boolean(leg.from.sourceLabel) || Boolean(leg.to.sourceLabel)) && (
            <span className="block break-words text-xs text-muted-foreground">
              {leg.from.sourceLabel} → {leg.to.sourceLabel}
            </span>
          )}
          <span className="block text-xs text-muted-foreground">
            {[leg.from.local, leg.from.timeZone, leg.to.local, leg.to.timeZone]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <SourceStates
            states={[leg.intention, leg.arrangement, leg.purchase]}
            identity={identity}
          />
        </span>
      ))}
    </>
  );
}
/** Exact source-state labels remain independent from purchase decoration. */
export function RowStates({
  row,
  identity,
}: {
  row: ArrangementRow;
  identity: Identity;
}): JSX.Element | null {
  if (row.kind === 'journey') return null;
  const states =
    row.kind === 'event'
      ? [row.source.intention, row.source.arrangement, row.source.purchase]
      : [row.source.status];
  return <SourceStates states={states} identity={identity} />;
}
function SourceStates({
  states,
  identity,
}: {
  states: (keyof Identity['labels']['sourceStates'] | null)[];
  identity: Identity;
}): JSX.Element {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      {states
        .filter((state) => state !== null)
        .map((state) =>
          state === 'Purchased' ? (
            <Badge key={state} variant="secondary" className="bg-app-accent/15 text-app-accent">
              {identity.labels.sourceStates[state]}
            </Badge>
          ) : (
            <span key={state} className="text-xs text-muted-foreground">
              {identity.labels.sourceStates[state]}
            </span>
          )
        )}
    </span>
  );
}
/** A single Rental keeps pickup and return dates and occurrence references inside its own timeline. */
export function RentalTimeline({
  rental,
  sources,
  identity,
}: {
  rental: Extract<ArrangementRow, { kind: 'rental' }>['source'];
  sources: ArrangementSources;
  identity: Identity;
}): JSX.Element {
  return (
    <span className="mt-3 block space-y-3 border-l border-dotted border-border pl-3">
      {[
        {
          key: 'pickup',
          label: identity.labels.pickup,
          id: rental.pickupVisitId,
          date: rental.start,
        },
        {
          key: 'return',
          label: identity.labels.return,
          id: rental.returnVisitId,
          date: rental.end,
        },
      ].map((endpoint) => {
        const visit = sources.visits?.find((candidate) => candidate.id === endpoint.id);
        const fallback = visit
          ? identity.labels.placeUnavailable
          : identity.labels.visitUnavailable;
        return (
          <span key={endpoint.key} className="block text-xs">
            <span className="font-medium">{endpoint.label}</span>
            {endpoint.date && (
              <span className="block text-muted-foreground">
                {identity.formatDate(endpoint.date)}
              </span>
            )}
            {endpoint.id !== null && (
              <span className="block break-words text-muted-foreground">
                {visit ? visitTitle(visit, sources, identity.labels) : fallback}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
