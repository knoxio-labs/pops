import { formatTripDate } from '@/fixtures/trip-overview-format';
import { BedDouble, CalendarDays, MapPin, Plane, Ticket } from 'lucide-react';

import { Badge } from '@pops/ui';

import { isTripDate } from '../trip-route-editing/lodging-periods';
import { useDecision } from './context';

import type { DecisionState } from './model';

const icons = { visit: MapPin, transport: Plane, stay: BedDouble, event: Ticket };

/** Display only captured arrangement dates and purchase status; selection never changes them. */
export function ArrangementRow({ source }: { source: DecisionState['arrangements'][number] }) {
  const Icon = icons[source.kind];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <Icon className="size-4 shrink-0 text-app-accent" aria-hidden />
      <span className="font-medium">{source.title}</span>
      {(source.from || source.to) && (
        <span className="text-muted-foreground">
          {[source.from, source.to]
            .filter(Boolean)
            .map((value) => (isTripDate(value) ? formatTripDate(value) : value))
            .join(' → ')}
        </span>
      )}
      {source.status !== 'Planned' && (
        <Badge variant={source.status === 'Purchased' ? 'default' : 'outline'}>
          {source.status}
        </Badge>
      )}
    </div>
  );
}

/** Inspect source plans and their explicit option associations before choosing. */
export function DecisionImpact() {
  const { state } = useDecision();
  return (
    <section aria-label="Affected plans" className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CalendarDays className="size-5 text-app-accent" aria-hidden />
        Affected plans
      </h2>
      <div className="divide-y rounded-xl border border-foreground/30 bg-muted/60 px-4">
        {state.arrangements.map((source) => {
          const options = state.options.filter((option) => option.affectedIds.includes(source.id));
          if (!options.length) return null;
          return (
            <div key={source.id} className="py-2">
              <ArrangementRow source={source} />
              <div className="flex flex-wrap gap-2 pl-7 pb-1">
                {options.map((option) => (
                  <Badge
                    key={option.id}
                    variant="outline"
                    className={
                      state.selectedOptionId === option.id
                        ? 'border-app-accent text-app-accent'
                        : ''
                    }
                  >
                    {option.title || 'Untitled option'}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
