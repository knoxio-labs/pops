import { Ticket } from 'lucide-react';

import { Button, Select } from '@pops/ui';

import { useCanvas } from '../trip-route-editing/canvas-context';
import { EventDocuments } from './documents';
import { EventLinkField } from './link-field';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Ticket arrangements and actual purchase remain distinct from intention and route placement. */
export function EventTickets({ event }: { event: TripRecord }) {
  const { state, change } = useCanvas();
  const update = (next: TripRecord) =>
    change({ ...state, records: state.records.map((r) => (r.id === event.id ? next : r)) });
  const arrangements: TripRecord['arrangement'][] = [
    'Not arranged',
    'Booked',
    'Agreed',
    'Not needed',
  ];
  return (
    <section className="space-y-2" aria-label="Tickets">
      <div className="flex flex-wrap items-center gap-2">
        <Ticket className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-medium">Tickets</h2>
        <div className="w-40">
          <Select
            aria-label="Ticket arrangement"
            variant="ghost"
            containerClassName="bg-transparent"
            value={event.arrangement}
            options={arrangements.map((value) => ({ value, label: value }))}
            onChange={(e) => {
              const arrangement = arrangements.find((value) => value === e.target.value);
              if (arrangement) update({ ...event, arrangement });
            }}
          />
        </div>
        <Button
          aria-pressed={event.purchase === 'Purchased'}
          variant={event.purchase === 'Purchased' ? 'default' : 'outline'}
          onClick={() =>
            update({ ...event, purchase: event.purchase === 'Purchased' ? undefined : 'Purchased' })
          }
        >
          Purchased
        </Button>
      </div>
      <EventLinkField
        field="ticketUrl"
        label="Tickets URL"
        placeholder="Add tickets URL"
        openLabel="Open tickets website"
      />
      <EventDocuments />
    </section>
  );
}
