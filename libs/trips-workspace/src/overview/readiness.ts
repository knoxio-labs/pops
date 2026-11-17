import { accommodationCoverage } from '../visit/coverage';
import { validDate } from '../visit/periods';
import { visitTiming } from './model';
import { resolvedVisit } from './route-context';

import type { RouteProjection } from '../route/projection';
import type { OverviewSources } from './types';

export type SleepCoverageState = 'covered' | 'open' | 'overlap' | 'unknown' | 'undated';

export interface SleepCoverageStop {
  id: number;
  title: string;
  timing: string;
  state: SleepCoverageState;
  openNights: number;
}

export interface TripReadiness {
  stops: SleepCoverageStop[];
  routeGaps: number[];
  openNights: number;
  undatedStops: number;
  unverifiedStops: number;
  overlappingStops: number;
  coveredStops: number;
}

export interface TripReadinessOptions {
  tripId: number;
  locale: string;
  sourceLabel: (kind: string, id: number) => string;
  coverageComplete: boolean;
}

/** Summarizes only the selected route's exact Visits and confirmed overnight coverage. */
export function tripReadiness(
  projection: RouteProjection | undefined,
  sources: OverviewSources,
  options: TripReadinessOptions
): TripReadiness {
  const { tripId, locale, sourceLabel, coverageComplete } = options;
  const route = projection?.order ?? [];
  const visits = route.flatMap((item) => (resolvedVisit(item) ? [item.source] : []));
  const routeGaps = route.flatMap((item) => (item.state === 'gap' ? [item.reference.id] : []));
  const stays = (sources.stays ?? []).filter((stay) => stay.tripId === tripId);
  const events = (sources.events ?? []).filter((event) => event.tripId === tripId);
  const stops = visits.map((visit): SleepCoverageStop => {
    const title =
      sources.places?.find((place) => place.id === visit.placeId)?.name ??
      sourceLabel('place', visit.placeId);
    const timing = visitTiming(visit, locale, (value) => value);
    const arrival = visit.timing.arrival;
    const departure = visit.timing.departure;
    if (!validDate(arrival) || !validDate(departure) || departure <= arrival)
      return { id: visit.id, title, timing, state: 'undated', openNights: 0 };

    const coverage = accommodationCoverage(visit, stays, events, coverageComplete);
    const openNights = coverage.periods.reduce(
      (total, period) =>
        period.coverage.state === 'missing'
          ? total + nightsBetween(period.coverage.arrival, period.coverage.departure)
          : total,
      0
    );
    const overlap = coverage.periods.some(
      (period) => period.coverage.state === 'covered' && period.coverage.stays.length > 1
    );
    const unknown =
      !coverageComplete ||
      !coverage.coverageKnown ||
      coverage.periods.some((period) => period.coverage.state === 'unknown');
    const state = coverageState(overlap, openNights, unknown);
    return { id: visit.id, title, timing, state, openNights };
  });

  return {
    stops,
    routeGaps,
    openNights: stops.reduce((total, stop) => total + stop.openNights, 0),
    undatedStops: stops.filter((stop) => stop.state === 'undated').length,
    unverifiedStops: stops.filter((stop) => stop.state === 'unknown').length,
    overlappingStops: stops.filter((stop) => stop.state === 'overlap').length,
    coveredStops: stops.filter((stop) => stop.state === 'covered').length,
  };
}

function coverageState(overlap: boolean, openNights: number, unknown: boolean): SleepCoverageState {
  if (overlap) return 'overlap';
  if (openNights > 0) return 'open';
  return unknown ? 'unknown' : 'covered';
}

function nightsBetween(arrival: string, departure: string): number {
  const start = new Date(`${arrival}T00:00:00Z`).getTime();
  const end = new Date(`${departure}T00:00:00Z`).getTime();
  return (end - start) / 86_400_000;
}
