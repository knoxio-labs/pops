import { MapPin } from 'lucide-react';

import { cn } from '@pops/ui';

import { eventRoute } from './model';

import type { JSX } from 'react';
import type { ReactNode } from 'react';

import type { Place, Visit } from '../stay/types';
import type { TripEvent } from './types';

/** Event placement follows only an explicit visit identity and the producer's ordered visit list. */
export function EventRoute({
  event,
  visits,
  places,
  children,
}: {
  event: TripEvent;
  visits: Visit[];
  places: Place[];
  children: ReactNode;
}): JSX.Element {
  const route = eventRoute(event, visits);
  return (
    <section aria-label="Event route context" className="space-y-3">
      {route.length === 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {event.visitId === null
              ? 'No visit linked'
              : `Linked visit ${event.visitId} is unavailable`}
          </p>
          <EventCard event={event}>{children}</EventCard>
        </>
      ) : (
        route.map((visit) => (
          <div key={visit.id} className="flex min-w-0 gap-3">
            <div className="flex shrink-0 flex-col items-center gap-2 pt-3">
              <MapPin className="size-4 text-app-accent" aria-hidden />
              <div className="grow border-l border-dotted border-app-accent/50" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="py-2">
                <h2 className="font-medium">
                  {places.find((place) => place.id === visit.placeId)?.name ?? `Visit ${visit.id}`}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {[visit.timing.arrival, visit.timing.departure].filter(Boolean).join(' – ') ||
                    'Visit dates not recorded'}
                </p>
              </div>
              {visit.id === event.visitId && <EventCard event={event}>{children}</EventCard>}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function EventCard({ event, children }: { event: TripEvent; children: ReactNode }): JSX.Element {
  return (
    <article
      aria-label="Event editor"
      className={cn(
        'min-w-0 space-y-4 rounded-xl border bg-muted/40 p-4',
        event.purchase === 'Purchased' ? 'border-l-4 border-l-app-accent' : 'border-dashed'
      )}
    >
      {children}
    </article>
  );
}
