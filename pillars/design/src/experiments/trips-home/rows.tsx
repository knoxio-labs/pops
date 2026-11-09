import { ChevronRight } from 'lucide-react';

import { Button } from '@pops/ui';

import { routeSummary, settingsTitle } from '../trip-settings/model';
import { homeBucket, homeParentLabel } from './model';

import type { HomeBucket, HomeState, HomeTrip } from './model';

/** Display labels for computed route-boundary groups, never persisted trip statuses. */
export const homeBucketOptions: { value: 'all' | HomeBucket; label: string }[] = [
  { value: 'all', label: 'All trips' },
  { value: 'current', label: 'Current' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'other', label: 'Other' },
  { value: 'past', label: 'Past' },
];

function TripRow({
  state,
  trip,
  select,
}: {
  state: HomeState;
  trip: HomeTrip;
  select: () => void;
}) {
  const summary = routeSummary(trip.route);
  const title = settingsTitle(trip.settings);
  const visits = trip.route.filter((item) => item.kind === 'visit').map((item) => item.title);
  const parent = homeParentLabel(state, trip);
  const showRoute = visits.length > 1 || (visits.length === 1 && visits[0] !== title);
  return (
    <Button
      variant="ghost"
      onClick={select}
      className="h-auto min-h-16 w-full justify-start gap-4 rounded-none border-b border-border px-4 py-3 text-left text-sm last:border-0"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block break-words font-medium">{title}</span>
        {trip.settings.when && (
          <span className="block whitespace-pre-wrap break-words text-sm font-normal text-muted-foreground">
            {trip.settings.when}
          </span>
        )}
        {showRoute && (
          <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
            {visits.join(' → ')}
          </span>
        )}
        {parent && (
          <span className="block text-xs font-normal text-muted-foreground">Parent: {parent}</span>
        )}
      </span>
      {summary.label && (
        <span className="whitespace-normal text-right text-xs font-normal text-muted-foreground">
          {summary.label}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 text-app-accent" aria-hidden />
    </Button>
  );
}

function TripList({
  state,
  trips,
  select,
}: {
  state: HomeState;
  trips: HomeTrip[];
  select: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {trips.map((trip) => (
        <TripRow
          key={trip.settings.id}
          state={state}
          trip={trip}
          select={() => select(trip.settings.id)}
        />
      ))}
    </div>
  );
}

/** Projects the same records as a compact list or nonempty groups computed from actual boundary dates. */
export function HomeRows({
  state,
  trips,
  grouped,
  select,
}: {
  state: HomeState;
  trips: HomeTrip[];
  grouped: boolean;
  select: (id: string) => void;
}) {
  if (!trips.length)
    return (
      <p
        role="status"
        className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
      >
        No trips found.
      </p>
    );
  if (!grouped) return <TripList state={state} trips={trips} select={select} />;
  return (
    <div className="space-y-5">
      {homeBucketOptions.flatMap(({ value, label }) => {
        if (value === 'all') return [];
        const members = trips.filter((trip) => homeBucket(trip, state.referenceDate) === value);
        if (!members.length) return [];
        return [
          <section key={value} aria-label={label} className="space-y-2">
            <h2 className="text-base font-semibold leading-tight tracking-normal">{label}</h2>
            <TripList state={state} trips={members} select={select} />
          </section>,
        ];
      })}
    </div>
  );
}
