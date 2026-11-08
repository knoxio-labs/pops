import { isTripDate } from '../trip-route-editing/lodging-periods';

/** Ordered route timing source independent of trip metadata and planning intention. */
export interface RouteTiming {
  id: string;
  title: string;
  kind: 'visit' | 'journey';
  start: string;
  end: string;
}

/** Valid route boundary labels and the records that supply them; unknown bounds remain open. */
export interface RouteSummary {
  label: string;
  sourceIds: string[];
  hasDates: boolean;
  openStart: boolean;
  openEnd: boolean;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function boundaryLabel(value: string | undefined): string {
  return isTripDate(value) ? dateLabel(value) : '';
}

/** Derive bounds only from first.start and last.end; inner dates never replace an unknown boundary. */
export function routeSummary(route: RouteTiming[]): RouteSummary {
  const first = route[0];
  const last = route.at(-1);
  const start = boundaryLabel(first?.start);
  const end = boundaryLabel(last?.end);
  const sourceIds = new Set<string>();
  if (start && first) sourceIds.add(first.id);
  if (end && last) sourceIds.add(last.id);
  return {
    label: start || end ? `${start} → ${end}`.trim() : '',
    sourceIds: [...sourceIds],
    hasDates: route.some((record) => isTripDate(record.start) || isTripDate(record.end)),
    openStart: !start,
    openEnd: !end,
  };
}
