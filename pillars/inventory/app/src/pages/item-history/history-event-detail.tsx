import { SheetPanel } from '@pops/ui';

import { dateTime } from '../../foundation/item-page/section-parts.js';
import { VerbButton } from '../../foundation/item-page/verb-button.js';

import type { ReactNode } from 'react';

import type { EventModel } from '../../foundation/model/model.js';

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}

/** Props for {@link HistoryEventDetail}. */
export interface HistoryEventDetailProps {
  event: EventModel | null;
  onClose: () => void;
  onUndo?: (id: string) => void;
  disabledReason?: string;
  className?: string;
}

/** Shows an item's selected history event and its immutable audit details. */
export function HistoryEventDetail({
  event,
  onClose,
  onUndo,
  disabledReason,
  className,
}: HistoryEventDetailProps) {
  if (event === null) return null;

  return (
    <SheetPanel
      title={event.summary}
      description={`${event.itemName}, ${dateTime(event.at)}`}
      onClose={onClose}
      className={className}
      footer={
        event.undoable ? (
          <VerbButton
            label="Undo this change"
            variant="outline"
            disabledReason={disabledReason}
            onClick={() => onUndo?.(event.id)}
          />
        ) : undefined
      }
    >
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
    </SheetPanel>
  );
}
