import { Button, cn } from '@pops/ui';

import { EventMark } from '../../foundation/badges/event-mark.js';
import { ACTOR_SHORT } from '../../foundation/feedback/actor-short.js';
import { formatWhen } from '../../foundation/feedback/when.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { OverviewPanel, PanelEmpty, PanelRow } from './panel.js';

import type { ReactElement } from 'react';

import type { EventModel } from '../../foundation/model/model.js';

/** Props for the Overview Recent work panel. */
export interface RecentWorkPanelProps {
  events: readonly EventModel[];
  now: string;
  disabledReason?: string;
  onNavigate: (path: string) => void;
  onUndo: (event: EventModel) => void;
  className?: string;
}

function RecentWorkRow({
  event,
  now,
  disabledReason,
  onUndo,
}: {
  event: EventModel;
  now: string;
  disabledReason?: string;
  onUndo: (event: EventModel) => void;
}): ReactElement {
  return (
    <PanelRow
      mark={<EventMark event={event} />}
      title={
        <>
          <span className="truncate font-medium">{event.itemName}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatWhen(event.at, now)}
          </span>
        </>
      }
      detail={
        <span className="truncate" title={event.actorName}>
          {ACTOR_SHORT[event.actor]}: {event.summary}
        </span>
      }
      verbs={
        event.undoable ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Undo ${event.summary} on ${event.itemName}`}
            aria-disabled={disabledReason !== undefined || undefined}
            title={disabledReason}
            className={cn('text-muted-foreground', disabledReason !== undefined && 'opacity-50')}
            onClick={disabledReason === undefined ? () => onUndo(event) : undefined}
          >
            Undo
          </Button>
        ) : (
          <span className="w-15" aria-hidden />
        )
      }
    />
  );
}

/** Renders the twelve newest activity events and their available Undo verbs. */
export function RecentWorkPanel({
  events,
  now,
  disabledReason,
  onNavigate,
  onUndo,
  className,
}: RecentWorkPanelProps): ReactElement {
  const visibleEvents = events.slice(0, 12);
  return (
    <OverviewPanel
      title="Recent work"
      className={className}
      icon={INVENTORY_ICONS.history}
      linkLabel="Activity"
      onLink={() => onNavigate('/inventory/sync?segment=activity')}
      empty={
        visibleEvents.length === 0 ? <PanelEmpty>Nothing has changed yet.</PanelEmpty> : undefined
      }
    >
      {visibleEvents.map((event) => (
        <RecentWorkRow
          key={event.id}
          event={event}
          now={now}
          disabledReason={disabledReason}
          onUndo={onUndo}
        />
      ))}
    </OverviewPanel>
  );
}
