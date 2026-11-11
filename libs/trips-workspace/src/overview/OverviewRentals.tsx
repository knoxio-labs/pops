import { arrangementRows, purchased } from '../arrangements/projection';
import { dateRange } from './model';
import { sourceAction } from './source-action';
import { SourceCard } from './SourceCard';

import type { JSX } from 'react';

import type { ArrangementRow } from '../arrangements/types';
import type { OverviewSources, TripOverviewProps } from './types';

type RentalRow = Extract<ArrangementRow, { kind: 'rental' }>;
const noLegs: ReadonlyMap<number, undefined> = new Map<number, undefined>();

/** Reuse canonical arrangement placement: one Rental at its explicit pickup, never a second return card. */
export function overviewRentals(sources: OverviewSources, tripId: number): RentalRow[] {
  return arrangementRows({
    rentals: sources.rentals?.filter((rental) => rental.tripId === tripId),
    legs: noLegs,
  }).filter((row): row is RentalRow => row.kind === 'rental');
}

/** Independent pickup and return source references remain visible inside their single canonical Rental. */
export function RentalCard({ row, ...props }: TripOverviewProps & { row: RentalRow }): JSX.Element {
  const rental = row.source;
  return (
    <SourceCard
      kind="rental"
      title={rental.provider ?? props.labels.source('rental', rental.id)}
      {...sourceAction(props, { kind: 'rental', id: rental.id })}
      labels={props.labels}
      purchased={purchased(row)}
      statuses={[rental.status]}
    >
      {dateRange(rental.start ?? undefined, rental.end ?? undefined, props.locale) && (
        <span className="block">
          {dateRange(rental.start ?? undefined, rental.end ?? undefined, props.locale)}
        </span>
      )}
      {(['pickup', 'return'] as const).map((endpoint) => {
        const id = endpoint === 'pickup' ? rental.pickupVisitId : rental.returnVisitId;
        return (
          <span key={endpoint} className="block">
            {props.labels.status(endpoint)} ·{' '}
            {id === null ? props.labels.unassociated : props.labels.source('visit', id)}
          </span>
        );
      })}
    </SourceCard>
  );
}
