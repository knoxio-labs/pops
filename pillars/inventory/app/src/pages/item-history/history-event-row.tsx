import { ArrowRight } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { EventMark } from '../../foundation/badges/event-mark.js';
import { shortDate } from '../../foundation/item-page/section-parts.js';
import { VerbButton } from '../../foundation/item-page/verb-button.js';

import type { EventModel } from '../../foundation/model/model.js';

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

/** Props for {@link HistoryEventRow}. */
export interface HistoryEventRowProps {
  event: EventModel;
  selected: boolean;
  onOpen: (id: string) => void;
  onUndo?: (id: string) => void;
  disabledReason?: string;
}

/** Renders one selectable item-history event with its optional Undo action. */
export function HistoryEventRow({
  event,
  selected,
  onOpen,
  onUndo,
  disabledReason,
}: HistoryEventRowProps) {
  return (
    <li className={cn('flex min-h-11 items-center gap-2 pr-1', selected && 'bg-app-accent/10')}>
      <ButtonPrimitive
        variant="ghost"
        aria-label={`${event.summary}, ${shortDate(event.at)}`}
        onClick={() => onOpen(event.id)}
        className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 rounded-md px-2 py-1 font-normal"
      >
        <EventMark event={event} />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span className="w-full truncate text-sm text-foreground">{event.summary}</span>
          <Change before={event.before} after={event.after} />
        </span>
        <span className="hidden w-40 shrink-0 truncate text-left text-xs text-muted-foreground @xl:inline">
          {event.actorName}
        </span>
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {shortDate(event.at)}
        </span>
      </ButtonPrimitive>
      {event.undoable && onUndo ? (
        <VerbButton
          label="Undo"
          variant="ghost"
          disabledReason={disabledReason}
          onClick={() => onUndo(event.id)}
          className="shrink-0"
        />
      ) : null}
    </li>
  );
}
