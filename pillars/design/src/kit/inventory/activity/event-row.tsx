/**
 * One history event in the Activity feed: what, to which item, the change
 * as before and after where there is one, who, when, and Undo while the
 * change can still be reversed.
 */
import { ArrowRight } from 'lucide-react';

import { Button, ButtonPrimitive, cn } from '@pops/ui';

import { EventMark } from '../shared/event-mark';
import { ACTOR_SHORT } from './event-concept';
import { formatWhen } from './when';

import type { EventModel } from '../shared/model';

/** Props for {@link EventRow}. */
export interface EventRowProps {
  event: EventModel;
  now: string;
  active?: boolean;
  disabledReason?: string;
  onOpen?: (id: string) => void;
  onUndo?: (id: string) => void;
}

function Change({ before, after }: { before: string | null; after: string | null }) {
  if (before === null || after === null) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate line-through decoration-muted-foreground/50">{before}</span>
      <ArrowRight className="size-3 shrink-0" aria-hidden />
      <span className="truncate text-foreground">{after}</span>
      <span aria-hidden>·</span>
    </span>
  );
}

/** The row. */
export function EventRow({ event, now, active, disabledReason, onOpen, onUndo }: EventRowProps) {
  const off = disabledReason !== undefined;
  return (
    <li
      aria-current={active === true ? true : undefined}
      className={cn(
        'flex h-12 items-center gap-3 border-l-2 pr-2 pl-3',
        active ? 'border-l-app-accent bg-app-accent/10' : 'border-l-transparent hover:bg-muted/50'
      )}
    >
      <EventMark event={event} />
      <div className="min-w-0 flex-1">
        <ButtonPrimitive
          variant="ghost"
          className="h-auto max-w-full min-w-0 justify-start gap-2 px-0 py-0 text-sm hover:bg-transparent"
          aria-label={`${event.summary}, ${event.itemName}. Show details`}
          onClick={() => onOpen?.(event.id)}
        >
          <span className="truncate font-medium">{event.itemName}</span>
          <span className="truncate font-normal text-muted-foreground">{event.summary}</span>
        </ButtonPrimitive>
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Change before={event.before} after={event.after} />
          <span className="shrink-0" title={event.actorName}>
            {ACTOR_SHORT[event.actor]}
          </span>
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatWhen(event.at, now)}
      </span>
      <span className="flex w-15 shrink-0 justify-end">
        {event.undoable ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Undo: ${event.summary}, ${event.itemName}`}
            aria-disabled={off || undefined}
            title={disabledReason}
            className={cn('text-muted-foreground', off && 'opacity-50')}
            onClick={off ? undefined : () => onUndo?.(event.id)}
          >
            Undo
          </Button>
        ) : null}
      </span>
    </li>
  );
}
