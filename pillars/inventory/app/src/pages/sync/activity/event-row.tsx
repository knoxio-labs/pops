import { ArrowRight } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { EventMark } from '../../../foundation/badges/event-mark.js';
import { formatWhen } from './when.js';

import type { ReactElement } from 'react';

import type { EventModel } from '../../../foundation/model/model.js';

/** Props for one read-only Activity event row. */
export interface EventRowProps {
  event: EventModel;
  now: string;
  active?: boolean;
  onOpen?: (id: string) => void;
}

function Change({
  before,
  after,
}: {
  before: string | null;
  after: string | null;
}): ReactElement | null {
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

/** Renders one Activity event with a detail-opening affordance and no write action. */
export function EventRow({ event, now, active, onOpen }: EventRowProps): ReactElement {
  return (
    <li
      aria-current={active === true ? true : undefined}
      className={cn(
        'flex min-h-12 items-center gap-3 border-l-2 pr-2 pl-3',
        active ? 'border-l-app-accent bg-app-accent/10' : 'border-l-transparent hover:bg-muted/50'
      )}
    >
      <EventMark event={event} />
      <div className="min-w-0 flex-1 py-1">
        <ButtonPrimitive
          type="button"
          variant="ghost"
          size="sm"
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
            {event.actorName}
          </span>
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatWhen(event.at, now)}
      </span>
    </li>
  );
}
