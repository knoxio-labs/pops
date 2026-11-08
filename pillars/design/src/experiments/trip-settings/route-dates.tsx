import { Plane, MapPin, Route } from 'lucide-react';

import { useSettings } from './context';
import { routeSummary } from './model';

/** Read source timing from route records; no trip-level bounds are stored or editable here. */
export function RouteDates() {
  const { state } = useSettings();
  const summary = routeSummary(state.route);
  if (!summary.hasDates) return null;
  return (
    <section aria-label="Route dates" className="space-y-2 border-t pt-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Route className="size-4 text-app-accent" aria-hidden />
        Route dates
      </h2>
      {summary.label && <p className="text-base font-medium">{summary.label}</p>}
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">
          From stops and journeys
        </summary>
        <div className="divide-y">
          {state.route.map((item) => {
            const Icon = item.kind === 'journey' ? Plane : MapPin;
            const range = routeSummary([item]);
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                <Icon className="size-4 text-app-accent" aria-hidden />
                <span>{item.title}</span>
                {range.label && <span className="text-muted-foreground">{range.label}</span>}
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
