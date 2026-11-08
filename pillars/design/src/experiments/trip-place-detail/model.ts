import { isTripDate } from '../trip-route-editing/lodging-periods';

/** Editable fictional idea snapshot; reference catalogues do not imply a selection. */
export interface IdeaState {
  name: string;
  kind: 'destination' | 'place' | 'activity';
  purpose: 'visit' | 'meet-people' | 'see-someone' | 'other';
  status: 'Saved' | 'Considering' | 'In plan';
  reason: string;
  cityId: string;
  address: string;
  timing: { mode: 'none' | 'month' | 'dates'; month: string; from: string; to: string };
  visitId: string;
  contacts: { id: string; name: string }[];
  recommendations: { id: string; contactId: string; note: string }[];
  links: { id: string; label: string; url: string }[];
  cities: { id: string; name: string }[];
  visits: { id: string; cityId: string; from: string; to: string }[];
  notes: string;
}

/** A source-data discrepancy to review, without inventing missing optional information. */
export interface IdeaFinding {
  id: string;
  title: string;
  detail: string;
}

function validMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && isTripDate(`${value}-01`);
}

function timingFindings(state: IdeaState): IdeaFinding[] {
  const findings: IdeaFinding[] = [];
  const { timing } = state;
  if (timing.mode === 'month' && timing.month && !validMonth(timing.month))
    findings.push({
      id: 'invalid-month',
      title: 'Check the month',
      detail: 'Enter a valid month.',
    });
  if (timing.mode !== 'dates') return findings;
  for (const field of ['from', 'to'] as const) {
    if (timing[field] && !isTripDate(timing[field]))
      findings.push({
        id: `invalid-${field}`,
        title: 'Check the dates',
        detail: 'Enter a valid calendar date.',
      });
  }
  if (isTripDate(timing.from) && isTripDate(timing.to) && timing.from > timing.to)
    findings.push({
      id: 'reversed-dates',
      title: 'Dates are reversed',
      detail: 'The end date is before the start date.',
    });
  return findings;
}

function visitFindings(state: IdeaState): IdeaFinding[] {
  const visit = state.visits.find((entry) => entry.id === state.visitId);
  if (!visit) return [];
  const findings: IdeaFinding[] = [];
  if (state.cityId && visit.cityId !== state.cityId)
    findings.push({
      id: 'visit-city',
      title: 'Visit is in another city',
      detail: 'Review the selected city or intended visit.',
    });
  const { timing } = state;
  const outside =
    timing.mode === 'dates'
      ? [timing.from, timing.to]
          .filter(isTripDate)
          .some(
            (date) =>
              (isTripDate(visit.from) && date < visit.from) ||
              (isTripDate(visit.to) && date > visit.to)
          )
      : timing.mode === 'month' &&
        validMonth(timing.month) &&
        ((isTripDate(visit.from) && timing.month < visit.from.slice(0, 7)) ||
          (isTripDate(visit.to) && timing.month > visit.to.slice(0, 7)));
  if (outside)
    findings.push({
      id: 'outside-visit',
      title: 'Timing is outside the visit',
      detail: 'Review the idea timing or intended visit.',
    });
  return findings;
}

/** Report invalid timing and unavailable selected references; never mutate the source snapshot. */
export function ideaFindings(state: IdeaState): IdeaFinding[] {
  const findings = [...timingFindings(state), ...visitFindings(state)];
  if (state.cityId && !state.cities.some((city) => city.id === state.cityId))
    findings.push({
      id: 'missing-city',
      title: 'City unavailable',
      detail: 'Choose a city again or clear the selection.',
    });
  if (state.visitId && !state.visits.some((visit) => visit.id === state.visitId))
    findings.push({
      id: 'missing-visit',
      title: 'Visit unavailable',
      detail: 'Choose an intended visit again or clear the selection.',
    });
  if (
    state.recommendations.some(
      (entry) =>
        entry.contactId && !state.contacts.some((contact) => contact.id === entry.contactId)
    )
  )
    findings.push({
      id: 'missing-contact',
      title: 'Recommender unavailable',
      detail: 'A recommendation references a contact that is unavailable.',
    });
  return findings;
}

function dateLabel(value: string, monthOnly = false): string {
  return new Intl.DateTimeFormat('en-AU', {
    ...(monthOnly ? {} : { day: 'numeric' }),
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

/** Format only valid timing explicitly captured on the idea, without borrowing visit bounds. */
export function ideaTimingLabel(state: IdeaState): string {
  const { timing } = state;
  if (timing.mode === 'none') return '';
  if (timing.mode === 'month')
    return validMonth(timing.month) ? dateLabel(`${timing.month}-01`, true) : '';
  return [timing.from, timing.to]
    .filter(isTripDate)
    .map((date) => dateLabel(date))
    .join(' – ');
}

/** Permit absolute HTTP(S) navigation targets; unsupported source text remains editable. */
export function safeIdeaUrl(value: string): string | undefined {
  if (!/^https?:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
