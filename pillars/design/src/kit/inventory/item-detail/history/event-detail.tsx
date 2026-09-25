/**
 * One event in full: what happened, before and after, the reason, who and
 * when, and Undo when it can still be compensated. Undo writes a new event;
 * it never deletes this one.
 */
import { Button } from '@pops/ui';

import { Sheet } from '../../foundation';
import { dateTime } from '../section-parts';

import type { ReactNode } from 'react';

import type { EventModel } from '../../foundation';

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}

/** Props for {@link EventDetailSheet}. */
export interface EventDetailSheetProps {
  event: EventModel | null;
  onClose: () => void;
  onUndo?: (id: string) => void;
}

/** The event detail sheet. */
export function EventDetailSheet({ event, onClose, onUndo }: EventDetailSheetProps) {
  return (
    <Sheet
      open={event !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={event?.summary ?? ''}
      description={event ? `${event.itemName}, ${dateTime(event.at)}` : undefined}
      footer={
        event?.undoable ? (
          <Button variant="outline" onClick={() => onUndo?.(event.id)}>
            Undo this change
          </Button>
        ) : undefined
      }
    >
      {event ? (
        <dl className="divide-y">
          {event.before !== null ? <Line label="Before">{event.before}</Line> : null}
          {event.after !== null ? <Line label="After">{event.after}</Line> : null}
          {event.reason !== null ? <Line label="Reason">{event.reason}</Line> : null}
          <Line label="By">{event.actorName}</Line>
          <Line label="When">{dateTime(event.at)}</Line>
          <Line label="Undo">
            {event.undoable
              ? 'Records a new event that puts it back, if nothing changed since.'
              : 'Not available: this kind of change is not reversed from history.'}
          </Line>
        </dl>
      ) : null}
    </Sheet>
  );
}
