import { BedDouble, Ticket } from 'lucide-react';

import { Badge } from '@pops/ui';

import { useVisitEditor } from './context';
import { visitDateLabel } from './model';

/** Related stays and events retain their own dates and purchase facts when the visit changes. */
export function VisitArrangements() {
  const { state } = useVisitEditor();
  const stays = state.stays.filter((stay) => stay.visitId === state.draft.id);
  const events = state.events.filter((event) => event.visitId === state.draft.id);
  if (!stays.length && !events.length) return null;
  return (
    <section aria-label="Related arrangements" className="space-y-2 border-t pt-3">
      <h2 className="text-sm font-semibold">In this visit</h2>
      <div className="space-y-2">
        {stays.map((stay) => (
          <div
            key={stay.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm ${stay.status === 'Purchased' ? 'border-foreground/30' : 'border-dashed border-foreground/30'}`}
          >
            <BedDouble className="size-4 text-app-accent" aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{stay.title}</span>
            <span className="text-muted-foreground">
              {visitDateLabel(stay.from)} → {visitDateLabel(stay.to)}
            </span>
            <Badge variant={stay.status === 'Purchased' ? 'default' : 'outline'}>
              {stay.status}
            </Badge>
          </div>
        ))}
        {events.map((event) => (
          <div
            key={event.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-foreground/30 px-3 py-2 text-sm"
          >
            <Ticket className="size-4 text-app-accent" aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{event.title}</span>
            <span className="text-muted-foreground">{visitDateLabel(event.date)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
