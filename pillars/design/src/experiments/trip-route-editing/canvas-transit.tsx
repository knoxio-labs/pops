import { presentTripRecord } from '@/fixtures/trip-overview-format';
import { isPurchasedArrangement, tripItemTier } from '@/fixtures/trip-overview-model';
import { Plane, GripVertical, Pencil } from 'lucide-react';

import { Badge, Button, Popover, PopoverContent, PopoverTrigger, cn } from '@pops/ui';

import { BookingFindings, BookingTimes } from './canvas-booking-times';
import { missingTransportSlot } from './canvas-connections';
import { useCanvas } from './canvas-context';
import { CanvasInsert } from './canvas-insert';
import { transportIssues } from './canvas-issues';
import { TransportFields, TransportName } from './canvas-transport-fields';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Journeys are route nodes between visits, with unchanged purchased times and destinations. */
export function TransitCard({
  record,
  datesInRail = false,
}: {
  record: TripRecord;
  datesInRail?: boolean;
}) {
  const { state, preview } = useCanvas();
  const display = presentTripRecord(record, state.records);
  const issues = transportIssues(preview, record);
  return (
    <section
      data-canvas-id={record.id}
      aria-label={record.title ?? display.title}
      className={cn(
        'group/transit space-y-2 rounded-xl border bg-card p-3',
        isPurchasedArrangement(record) ? 'border-l-4 border-l-app-accent' : 'border-dashed',
        issues.length > 0 && 'border-destructive bg-destructive/10'
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <GripVertical
          className="size-4 cursor-grab opacity-0 group-hover/transit:opacity-100 group-focus-within/transit:opacity-100"
          aria-hidden
        />
        {!datesInRail && <Plane className="size-5" aria-hidden />}
        <div className="min-w-0 flex-1">
          <TransportName record={record} />
        </div>
        <Badge variant={isPurchasedArrangement(record) ? 'default' : 'outline'}>
          {tripItemTier(record)}
        </Badge>
        <TransportEditor record={record} />
      </div>
      {!datesInRail && display.when && (
        <p className="text-sm text-muted-foreground">{display.when}</p>
      )}

      <BookingFindings recordId={record.id} />
      {issues.map((issue) => (
        <p key={issue} className="text-sm font-medium text-foreground">
          {issue}
        </p>
      ))}
    </section>
  );
}

/** Replace a missing connection's separator with one actionable transport slot. */
export function MissingTransit({ from, index = 0 }: { from: string; index?: number }) {
  const { state } = useCanvas();
  const missing = missingTransportSlot(state, from);
  return (
    <CanvasInsert
      target={{ after: from }}
      defaultKind={missing ? 'transport' : 'city'}
      slotLabel={missing ? 'Transport' : undefined}
      label={missing ? 'Add transport' : `Insert after stop ${index + 1}`}
    />
  );
}

function TransportEditor({ record }: { record: TripRecord }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Edit transport"
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover/transit:opacity-100 group-focus-within/transit:opacity-100 pointer-coarse:opacity-100"
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-full space-y-3">
        <TransportFields record={record} />
        <BookingTimes recordId={record.id} expanded />
      </PopoverContent>
    </Popover>
  );
}
