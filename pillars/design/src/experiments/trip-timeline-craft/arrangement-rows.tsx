import { formatTripDate } from '@/fixtures/trip-overview-format';
import { BedDouble, CalendarDays, ChevronRight, Lightbulb, Music2 } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { ArrangementMark } from './row-primitives';

import type { CraftActivity, CraftStay, CraftThought } from '@/fixtures/trip-timeline-craft';

import type { CraftRowActions } from './model';

/** Accommodation remains one source with independently supplied check-in and check-out dates. */
export function StayRow({ stay, onOpen }: { stay: CraftStay; onOpen: CraftRowActions['onOpen'] }) {
  const purchased = stay.state === 'Purchased';
  return (
    <article className={cn('min-w-0 py-3', purchased && 'rounded-xl bg-muted/40 px-4')}>
      <div
        className={cn(
          'border-l-2 pl-4',
          purchased ? 'border-app-accent' : 'border-dotted border-border'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <BedDouble className="size-4" aria-hidden />
            Stay
          </span>
          <ArrangementMark state={stay.state} />
        </div>
        <Button
          variant="ghost"
          className="h-auto min-h-11 w-full justify-start whitespace-normal px-0 py-2 text-left text-base font-semibold hover:bg-transparent"
          onClick={() => onOpen(stay)}
        >
          <span className="min-w-0 flex-1 break-words">{stay.title}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="text-muted-foreground">In </span>
            {formatTripDate(stay.checkIn)}
          </span>
          <span>
            <span className="text-muted-foreground">Out </span>
            {formatTripDate(stay.checkOut)}
          </span>
        </div>
        {stay.handledBy && (
          <p className="mt-2 text-sm text-muted-foreground">Handled by {stay.handledBy}</p>
        )}
      </div>
    </article>
  );
}

/** Activity moment preserves its supplied date, clock and booking state. */
export function ActivityRow({
  activity,
  onOpen,
}: {
  activity: CraftActivity;
  onOpen: CraftRowActions['onOpen'];
}) {
  const Icon = activity.icon === 'music' ? Music2 : CalendarDays;
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-3 size-4 shrink-0 text-muted-foreground" aria-label="Activity" />
      <div className="min-w-0 flex-1">
        <Button
          variant="ghost"
          className="h-auto min-h-11 w-full justify-start whitespace-normal px-0 py-2 text-left font-medium hover:bg-transparent"
          onClick={() => onOpen(activity)}
        >
          <span className="min-w-0 flex-1 break-words">{activity.title}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span>
            {formatTripDate(activity.date)}
            {activity.localTime && ` · ${activity.localTime}`}
          </span>
          <ArrangementMark state={activity.state} />
        </div>
        {activity.localTime && (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {activity.timeZone ?? 'Timezone not set'}
          </p>
        )}
      </div>
    </div>
  );
}

/** Undated thoughts keep their explicit Visit context and remain visually distinguishable from bookings. */
export function CraftThoughtRow({ thought }: { thought: CraftThought }) {
  return (
    <div className="flex items-start gap-3 py-3 text-sm">
      <Lightbulb className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="break-words leading-relaxed">{thought.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">Idea · no date set</p>
      </div>
    </div>
  );
}
