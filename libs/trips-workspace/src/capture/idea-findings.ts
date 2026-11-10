import type { Place, Visit } from '../stay/types';
import type { CaptureSource } from './types';

/** Editable timing fields retain invalid text until the owner accepts a valid source value. */
export interface IdeaFindingInput {
  id: number;
  placeId: number | null;
  visitId: number | null;
  timing:
    | { mode: 'none' }
    | { mode: 'month'; month?: string }
    | { mode: 'dates'; from?: string; to?: string };
}

/** Non-blocking discrepancy tied to the exact source identities that produced it. */
export interface IdeaFinding {
  id: string;
  title: string;
  detail: string;
  source: { ideaId: number; placeId?: number; visitId?: number };
}

type IdeaSource = CaptureSource['ideas'][number];

/** Report invalid explicit timing and unavailable/mismatched references without blocking edits. */
export function ideaFindings(
  idea: IdeaFindingInput,
  places: readonly Place[] | undefined,
  visits: readonly Visit[] | undefined
): IdeaFinding[] {
  const visit =
    idea.visitId === null ? undefined : visits?.find((item) => item.id === idea.visitId);
  return [
    ...timingFindings(idea),
    ...referenceFindings(idea, places, visits, visit),
    ...(visit === undefined ? [] : outsideVisitFindings(idea, visit)),
  ];
}

function referenceFindings(
  idea: IdeaFindingInput,
  places: readonly Place[] | undefined,
  visits: readonly Visit[] | undefined,
  visit: Visit | undefined
): IdeaFinding[] {
  const findings: IdeaFinding[] = [];
  if (
    idea.placeId !== null &&
    places !== undefined &&
    !places.some((place) => place.id === idea.placeId)
  ) {
    findings.push(
      finding(idea, {
        id: 'missing-place',
        title: 'Place unavailable',
        detail: 'The selected place is not available.',
        placeId: idea.placeId,
      })
    );
  }
  if (idea.visitId !== null && visits !== undefined && visit === undefined) {
    findings.push(
      finding(idea, {
        id: 'missing-visit',
        title: 'Visit unavailable',
        detail: 'The selected visit is not available.',
        visitId: idea.visitId,
      })
    );
  }
  if (idea.placeId !== null && visit !== undefined && idea.placeId !== visit.placeId) {
    findings.push(
      finding(idea, {
        id: 'visit-place',
        title: 'Visit is at another place',
        detail: 'Review the selected place or intended visit.',
        placeId: idea.placeId,
        visitId: visit.id,
      })
    );
  }
  return findings;
}

function timingFindings(idea: IdeaFindingInput): IdeaFinding[] {
  const { timing } = idea;
  const findings: IdeaFinding[] = [];
  findings.push(...monthFindings(idea));
  if (timing.mode !== 'dates') return findings;
  findings.push(...dateFieldFindings(idea, timing));
  if (validDate(timing.from) && validDate(timing.to) && timing.from > timing.to) {
    findings.push(
      finding(idea, {
        id: 'reversed-dates',
        title: 'Dates are reversed',
        detail: 'The end date is before the start date.',
      })
    );
  }
  return findings;
}

function monthFindings(idea: IdeaFindingInput): IdeaFinding[] {
  const { timing } = idea;
  return timing.mode === 'month' &&
    timing.month !== undefined &&
    timing.month !== '' &&
    !validMonth(timing.month)
    ? [
        finding(idea, {
          id: 'invalid-month',
          title: 'Check the month',
          detail: 'Enter a valid month.',
        }),
      ]
    : [];
}

function dateFieldFindings(
  idea: IdeaFindingInput,
  timing: Extract<IdeaFindingInput['timing'], { mode: 'dates' }>
): IdeaFinding[] {
  const findings: IdeaFinding[] = [];
  for (const field of ['from', 'to'] as const) {
    const value = timing[field];
    if (value !== undefined && value !== '' && !validDate(value)) {
      findings.push(
        finding(idea, {
          id: `invalid-${field}`,
          title: 'Check the dates',
          detail: 'Enter a valid calendar date.',
        })
      );
    }
  }
  return findings;
}

function outsideVisitFindings(idea: IdeaFindingInput, visit: Visit): IdeaFinding[] {
  const { arrival, departure } = visit.timing;
  return outsideVisit(idea.timing, arrival, departure)
    ? [
        finding(idea, {
          id: 'outside-visit',
          title: 'Timing is outside the visit',
          detail: 'Review the idea timing or intended visit.',
          visitId: visit.id,
        }),
      ]
    : [];
}

function outsideVisit(
  timing: IdeaFindingInput['timing'],
  arrival: string | undefined,
  departure: string | undefined
): boolean {
  if (timing.mode === 'dates')
    return outsideDateBounds([timing.from, timing.to].filter(validDate), arrival, departure);
  return (
    timing.mode === 'month' &&
    validMonth(timing.month) &&
    outsideMonthBounds(timing.month, arrival, departure)
  );
}

function outsideDateBounds(
  dates: string[],
  arrival: string | undefined,
  departure: string | undefined
): boolean {
  return dates.some(
    (date) =>
      (arrival !== undefined && validDate(arrival) && date < arrival) ||
      (departure !== undefined && validDate(departure) && date > departure)
  );
}

function outsideMonthBounds(
  month: string,
  arrival: string | undefined,
  departure: string | undefined
): boolean {
  return (
    (arrival !== undefined && validDate(arrival) && month < arrival.slice(0, 7)) ||
    (departure !== undefined && validDate(departure) && month > departure.slice(0, 7))
  );
}

function validMonth(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/u.test(value);
}

function validDate(value: string | undefined): value is string {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function finding(
  idea: IdeaFindingInput,
  value: { id: string; title: string; detail: string; placeId?: number; visitId?: number }
): IdeaFinding {
  const { id, title, detail, ...refs } = value;
  return { id: `idea-${idea.id}-${id}`, title, detail, source: { ideaId: idea.id, ...refs } };
}

/** Accept an owner idea shape without treating valid persisted values as the only editor state. */
export function ideaFindingInput(idea: IdeaSource): IdeaFindingInput {
  return { id: idea.id, placeId: idea.placeId, visitId: idea.visitId, timing: idea.timing };
}
