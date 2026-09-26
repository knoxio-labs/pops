/**
 * One event in full: when, who, what it changed, and what Undo would record.
 * Undo is a new compensating event, never an erase, and it is refused when
 * the same field changed since.
 */
import { Button } from '@pops/ui';

import { SheetPanel } from '../shared/sheet';
import { SheetSection } from '../sync/repair-evidence';

import type { EventModel } from '../shared/model';

function fullTime(iso: string): string {
  const at = new Date(iso);
  const date = at.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const time = at.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${date}, ${time}`;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function undoText(event: EventModel): string {
  if (!event.undoable)
    return 'This change cannot be undone. Creation and service imports are permanent in history.';
  if (event.before !== null) {
    return `Undo records a new event that sets it back to ${event.before}. It is refused if it changed again since.`;
  }
  return 'Undo records a new event that reverses this one. It is refused if the item changed again since.';
}

/** The event detail sheet. */
export function EventDetailSheet({ event, onClose }: { event: EventModel; onClose?: () => void }) {
  return (
    <SheetPanel
      title={event.summary}
      description={event.itemName}
      onClose={onClose}
      className="rounded-xl"
      footer={
        <>
          <Button size="sm" variant="outline">
            Open {event.itemName}
          </Button>
          {event.undoable ? <Button size="sm">Undo this change</Button> : null}
        </>
      }
    >
      <div className="space-y-5">
        <dl className="divide-y overflow-hidden rounded-lg border">
          <Fact label="When" value={fullTime(event.at)} />
          <Fact label="By" value={event.actorName} />
          <Fact label="Before" value={event.before} />
          <Fact label="After" value={event.after} />
          <Fact label="Reason" value={event.reason} />
          <Fact label="Event" value={event.id} />
        </dl>
        <SheetSection title="Undo">
          <p className="text-sm">{undoText(event)}</p>
        </SheetSection>
      </div>
    </SheetPanel>
  );
}
