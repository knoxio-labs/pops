import { validDate } from './periods';

import type { Stay, Visit } from './types';

/** A nonblocking discrepancy between independently owned source dates. */
export interface VisitFinding {
  id: string;
  kind: 'reversed' | 'outside';
  name?: string | null;
}
/** Report contradictions against explicit known bounds without changing or constraining source facts. */
export function visitFindings(visit: Visit, candidates: Stay[]): VisitFinding[] {
  const findings: VisitFinding[] = [];
  if (
    validDate(visit.timing.arrival) &&
    validDate(visit.timing.departure) &&
    visit.timing.arrival > visit.timing.departure
  )
    findings.push({ id: 'reversed', kind: 'reversed' });
  for (const stay of candidates) {
    if (stay.visitId === visit.id && outsideVisit(visit, stay))
      findings.push({
        id: `stay:${stay.id}`,
        kind: 'outside',
        name: stay.name,
      });
  }
  return findings;
}
function outsideVisit(visit: Visit, stay: Stay): boolean {
  return outsideStart(visit, stay) || outsideEnd(visit, stay);
}
function outsideStart(visit: Visit, stay: Stay): boolean {
  return (
    validDate(visit.timing.arrival) &&
    validDate(stay.timing.arrival) &&
    stay.timing.arrival < visit.timing.arrival
  );
}
function outsideEnd(visit: Visit, stay: Stay): boolean {
  return (
    validDate(visit.timing.departure) &&
    validDate(stay.timing.departure) &&
    stay.timing.departure > visit.timing.departure
  );
}
