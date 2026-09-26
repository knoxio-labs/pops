/**
 * One event's symbol in a tile the size of an item mark: the same mark in
 * Recent work, the Activity feed and an item's history.
 */
import { cn } from '@pops/ui';

import { EVENT_CONCEPT } from '../model/event-groups';
import { INVENTORY_ICONS } from '../model/icons';

import type { EventModel } from '../model/model';

/** The event's concept symbol in a muted tile. */
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
