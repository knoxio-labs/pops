/**
 * Recent work: the latest events across the pillar, each with Undo while it
 * can still be undone. The Activity segment of the Sync page has the rest.
 */
import { Button, cn } from '@pops/ui';

import { ACTOR_SHORT, EVENT_CONCEPT } from '../activity/event-concept';
import { formatWhen } from '../activity/when';
import { INVENTORY_ICONS } from '../shared/icons';
import { OverviewPanel, PanelEmpty, PanelRow } from './panel';

import type { EventModel } from '../shared/model';

/** One event's symbol, in a tile the size of an item mark. */
export function EventMark({ event, className }: { event: EventModel; className?: string }) {
  const Icon = INVENTORY_ICONS[EVENT_CONCEPT[event.kind]];
  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground',
        className
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

/** Props for {@link RecentWorkPanel}. */
export interface RecentWorkPanelProps {
  events: readonly EventModel[];
  now: string;
  disabledReason?: string;
  onNavigate?: (path: string) => void;
  onUndo?: (event: EventModel) => void;
  className?: string;
}

/** The newest events, newest first. */
export function RecentWorkPanel({
  events,
  now,
  disabledReason,
  onNavigate,
  onUndo,
  className,
}: RecentWorkPanelProps) {
  return (
    <OverviewPanel
      title="Recent work"
      className={className}
      icon={INVENTORY_ICONS.history}
      linkLabel="Activity"
      onLink={() => onNavigate?.('/inventory/sync?segment=activity')}
      empty={events.length === 0 ? <PanelEmpty>Nothing has changed yet.</PanelEmpty> : undefined}
    >
      {events.slice(0, 12).map((event) => (
        <PanelRow
          key={event.id}
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
                className={cn(
                  'text-muted-foreground',
                  disabledReason !== undefined && 'opacity-50'
                )}
                onClick={disabledReason === undefined ? () => onUndo?.(event) : undefined}
              >
                Undo
              </Button>
            ) : (
              <span className="w-15" aria-hidden />
            )
          }
        />
      ))}
    </OverviewPanel>
  );
}
