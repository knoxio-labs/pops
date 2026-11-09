import { ArrowLeft } from 'lucide-react';

import { Button } from '@pops/ui';

import { routeSummary, settingsTitle } from '../trip-settings/model';
import { homeParentLabel } from './model';

import type { HomeState, HomeTrip } from './model';

/** Opens only the selected trip's stored settings and ordered route facts in a local read-only view. */
export function HomeTripPreview({
  state,
  trip,
  back,
}: {
  state: HomeState;
  trip: HomeTrip;
  back: () => void;
}) {
  const summary = routeSummary(trip.route);
  const parent = homeParentLabel(state, trip);
  return (
    <div className="space-y-5">
      <Button variant="ghost" className="min-h-11 text-sm" onClick={back}>
        <ArrowLeft className="size-4" aria-hidden /> Trips
      </Button>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold leading-tight tracking-normal">
          {settingsTitle(trip.settings)}
        </h1>
        {trip.settings.when && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{trip.settings.when}</p>
        )}
        {summary.label && <p className="text-sm text-muted-foreground">{summary.label}</p>}
        {parent && <p className="text-xs text-muted-foreground">{parent}</p>}
      </header>
      {trip.route.length > 0 && (
        <section aria-label="Route" className="space-y-3">
          <h2 className="text-base font-semibold leading-tight tracking-normal">Route</h2>
          <ol className="divide-y divide-border rounded-xl border border-border bg-card">
            {trip.route.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.kind === 'visit' ? 'Visit' : 'Journey'}
                  </p>
                </div>
                {routeSummary([item]).label && (
                  <p className="text-right text-xs text-muted-foreground">
                    {routeSummary([item]).label}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {trip.settings.notes && (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold leading-tight tracking-normal">Notes</h2>
          <p className="whitespace-pre-wrap text-sm">{trip.settings.notes}</p>
        </section>
      )}
    </div>
  );
}
