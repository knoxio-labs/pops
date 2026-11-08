import { BedDouble, CalendarDays, Car } from 'lucide-react';

import { TextInput } from '@pops/ui';

import { useJourney } from './context';
import { endpointDay } from './display';
import { endpointInstant, endpointLabel, journeyWindow } from './model';
import { JourneyTimelineRow } from './timeline-row';

import type { JourneyContextItem } from './model';

const contextIcons = { event: CalendarDays, stay: BedDouble, transfer: Car };

/** Nearby records use the local departure/arrival window; unrelated trip bookings stay outside it. */
export function JourneyWindowContext({ side }: { side: 'before' | 'after' }) {
  const { state } = useJourney();
  const first = state.legs[0];
  if (!first) return null;
  const departure = endpointInstant(first.from);
  if (departure === undefined) return null;
  const items = journeyWindow(state)
    .filter((item) => {
      const at = endpointInstant(item.start);
      return at !== undefined && (side === 'before' ? at < departure : at >= departure);
    })
    .toSorted((a, b) => (endpointInstant(a.start) ?? 0) - (endpointInstant(b.start) ?? 0));
  return items.map((item) => <ContextBooking key={item.id} item={item} />);
}

function ContextBooking({ item }: { item: JourneyContextItem }) {
  const { state, change } = useJourney();
  const update = (field: 'start' | 'end', value: string) =>
    change({
      ...state,
      context: state.context.map((entry) =>
        entry.id === item.id ? { ...entry, [field]: { ...entry[field], local: value } } : entry
      ),
    });
  return (
    <JourneyTimelineRow day={endpointDay(item.start)} Icon={contextIcons[item.kind]}>
      <article
        aria-label={item.title}
        className="rounded-xl border border-dashed border-foreground/25 bg-muted/40 p-3"
      >
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <p className="py-1 text-xs text-foreground/80">{endpointLabel(state, item.start)}</p>
        <div className="flex flex-wrap gap-2">
          {(['start', 'end'] as const).map((field) => (
            <div key={`${item.id}-${field}-${item[field].local}`} className="w-64 max-w-full">
              <TextInput
                type="datetime-local"
                aria-label={`${item.title} ${field}`}
                variant="ghost"
                containerClassName="bg-transparent"
                defaultValue={item[field].local}
                onBlur={(event) => {
                  if (event.currentTarget.value !== item[field].local)
                    update(field, event.currentTarget.value);
                }}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-foreground/70">
          {item.start.timeZone}
          {item.end.timeZone !== item.start.timeZone && ` → ${item.end.timeZone}`}
        </p>
      </article>
    </JourneyTimelineRow>
  );
}
