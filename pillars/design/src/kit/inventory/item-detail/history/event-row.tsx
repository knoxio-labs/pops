/**
 * One history event as a row: its symbol, what happened in words, the
 * before and after when there are both, who did it and when, and Undo when
 * the act can be compensated. Opening a row shows the whole event.
 */
import { ArrowRight } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { EventMark } from '../../shared/event-mark';
import { shortDate } from '../section-parts';
import { VerbButton } from '../verb-button';

import type { EventModel } from '../../foundation';

/** Props for {@link EventRow}. */
export interface EventRowProps {
  event: EventModel;
  /** Shows the actor column; the page preview leaves it out. */
  showActor?: boolean;
  selected?: boolean;
  onOpen?: (id: string) => void;
  onUndo?: (id: string) => void;
}

function Change({ before, after }: Pick<EventModel, 'before' | 'after'>) {
  if (before === null || after === null) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <span className="truncate">{before}</span>
      <ArrowRight className="size-3 shrink-0" aria-label="to" />
      <span className="truncate text-foreground">{after}</span>
    </span>
  );
}

/** One event row. */
export function EventRow({
  event,
  showActor = false,
  selected = false,
  onOpen,
  onUndo,
}: EventRowProps) {
  return (
    <li className={cn('flex min-h-11 items-center gap-2 pr-1', selected && 'bg-app-accent/10')}>
      <ButtonPrimitive
        variant="ghost"
        aria-label={`${event.summary}, ${shortDate(event.at)}`}
        onClick={() => onOpen?.(event.id)}
        className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 rounded-md px-2 py-1 font-normal"
      >
        <EventMark event={event} />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span className="w-full truncate text-sm text-foreground">{event.summary}</span>
          <Change before={event.before} after={event.after} />
        </span>
        {showActor ? (
          <span className="hidden w-40 shrink-0 truncate text-left text-xs text-muted-foreground @xl:inline">
            {event.actorName}
          </span>
        ) : null}
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {shortDate(event.at)}
        </span>
      </ButtonPrimitive>
      {event.undoable && onUndo ? (
        <VerbButton
          label="Undo"
          variant="ghost"
          onClick={() => onUndo(event.id)}
          className="shrink-0"
        />
      ) : null}
    </li>
  );
}
