import { accommodationCoverage } from '../visit/coverage';

import type { Visit } from '../stay/types';
import type { ArrangementSources } from './types';

/** A proven gap or actual arranged-stay overlap, using bounded checkout-exclusive Visit dates. */
export interface ArrangementCoverageFinding {
  kind: 'missing' | 'overlap';
  arrival: string;
  departure: string;
  stayIds: number[];
}
/** Source coverage findings remain independent from search/purchase filters and source card presentation. */
export interface VisitArrangementCoverage {
  unknown: boolean;
  findings: ArrangementCoverageFinding[];
}

/** Reuse the shared source-state policy and merge adjacent identical findings so ideas do not duplicate gap actions. */
export function arrangementVisitCoverage(
  visit: Visit,
  sources: ArrangementSources,
  complete: boolean
): VisitArrangementCoverage {
  const projection = accommodationCoverage(
    visit,
    sources.stays ?? [],
    sources.events ?? [],
    complete
  );
  const findings: ArrangementCoverageFinding[] = [];
  for (const period of projection.periods) {
    const { coverage } = period;
    if (coverage.state === 'unknown' || (coverage.state === 'covered' && coverage.stays.length < 2))
      continue;
    const kind = coverage.state === 'missing' ? 'missing' : 'overlap';
    const stayIds = coverage.stays.map((stay) => stay.id);
    const previous = findings.at(-1);
    if (
      previous &&
      previous.kind === kind &&
      previous.departure === coverage.arrival &&
      sameIds(previous.stayIds, stayIds)
    )
      previous.departure = coverage.departure;
    else findings.push({ kind, arrival: coverage.arrival, departure: coverage.departure, stayIds });
  }
  return { unknown: !projection.coverageKnown, findings };
}
function sameIds(first: number[], second: number[]): boolean {
  return first.length === second.length && first.every((id, index) => second[index] === id);
}
