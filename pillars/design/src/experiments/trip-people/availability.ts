import { overlap } from '../contact-person-detail/model';
import { isTripDate } from '../trip-route-editing/lodging-periods';

import type { PeopleFinding, PeopleRow, TripPeopleState, TripPersonPlan } from './types';

/** Projects only exact bounded inclusive source availability in the explicitly selected route visit. */
export function planAvailability(
  state: TripPeopleState,
  plan: TripPersonPlan
): PeopleRow['availability'] {
  const contact = state.contacts.find((entry) => entry.id === plan.contactId);
  const visit = state.visits.find((entry) => entry.id === plan.visitId);
  if (!contact || !visit) return [];
  const window = { city: visit.cityId, start: visit.from, end: visit.to };
  return contact.person.availability.flatMap((source) => {
    const label = overlap(source, window);
    return label
      ? [
          {
            source,
            overlap: label,
            from: source.start > window.start ? source.start : window.start,
            to: source.end < window.end ? source.end : window.end,
          },
        ]
      : [];
  });
}

/** Validates only explicit calendar dates and ordering; open or absent dates remain unknown. */
export function planDateFindings(plan: TripPersonPlan): PeopleFinding[] {
  const findings: PeopleFinding[] = [];
  for (const field of ['from', 'to'] as const) {
    if (plan[field] && !isTripDate(plan[field]))
      findings.push({ id: `invalid-${field}`, message: 'Use a valid calendar date.' });
  }
  if (isTripDate(plan.from) && isTripDate(plan.to) && plan.from > plan.to)
    findings.push({ id: 'reversed-dates', message: 'The end date precedes the start date.' });
  return findings;
}

function availabilityConflicts(state: TripPeopleState, plan: TripPersonPlan): PeopleFinding[] {
  const windows = planAvailability(state, plan);
  const visit = state.visits.find((entry) => entry.id === plan.visitId);
  if (!visit) return [];
  const meeting = { city: visit.cityId, start: plan.from, end: plan.to };
  const contact = state.contacts.find((entry) => entry.id === plan.contactId);
  const findings: PeopleFinding[] = [];
  if (
    contact?.person.availability.some(
      (source) => source.status === 'Unavailable' && overlap(source, meeting)
    )
  )
    findings.push({
      id: 'meeting-unavailable',
      message: 'The selected dates overlap recorded unavailability.',
    });
  const contradicts = windows.some(({ source }, index) =>
    windows
      .slice(index + 1)
      .some(
        ({ source: other }) =>
          ((source.status === 'Available' && other.status === 'Unavailable') ||
            (source.status === 'Unavailable' && other.status === 'Available')) &&
          overlap(source, other)
      )
  );
  if (contradicts)
    findings.push({
      id: 'availability-conflict',
      message: 'Available and unavailable source windows overlap in this visit.',
    });
  return findings;
}

/** Reports selected missing references and explicit date or availability incompatibilities without rewriting them. */
export function planFindings(state: TripPeopleState, plan: TripPersonPlan): PeopleFinding[] {
  const findings = planDateFindings(plan);
  if (!state.contacts.some((contact) => contact.id === plan.contactId))
    findings.push({ id: 'missing-contact', message: 'The linked contact is unavailable.' });
  const visit = state.visits.find((entry) => entry.id === plan.visitId);
  if (plan.visitId && !visit)
    findings.push({ id: 'missing-visit', message: 'The selected visit is unavailable.' });
  if (visit && isTripDate(visit.from) && isTripDate(visit.to) && visit.from <= visit.to) {
    if (
      [plan.from, plan.to].filter(isTripDate).some((date) => date < visit.from || date > visit.to)
    )
      findings.push({
        id: 'outside-visit',
        message: 'Selected meeting dates fall outside this route visit.',
      });
  }
  return [...findings, ...availabilityConflicts(state, plan)];
}
