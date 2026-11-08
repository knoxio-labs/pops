import { formatTripDate } from '@/fixtures/trip-overview-format';
import { CalendarDays } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { isTripDate } from '../trip-route-editing/lodging-periods';

import type { CapturedItem } from './model';

/** Optional exact date fields preserve partial and conflicting input without moving the source. */
export function CaptureDates({
  item,
  change,
}: {
  item: CapturedItem;
  change: (next: CapturedItem) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label="Edit capture dates">
          <CalendarDays className="size-4" aria-hidden />
          {dateLabel(item)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <TextInput
          label="Start date"
          type="date"
          value={item.start}
          onInput={(event) => change({ ...item, start: event.currentTarget.value })}
        />
        <TextInput
          label="End date"
          type="date"
          value={item.end}
          onInput={(event) => change({ ...item, end: event.currentTarget.value })}
        />
        {item.start && item.end && item.start > item.end && (
          <p role="alert" className="text-sm text-destructive">
            End precedes start
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function dateLabel(item: CapturedItem): string {
  if (!item.start && !item.end) return 'Add dates';
  const format = (value: string) => (isTripDate(value) ? formatTripDate(value) : value);
  return `${format(item.start)} → ${format(item.end)}`.trim();
}
