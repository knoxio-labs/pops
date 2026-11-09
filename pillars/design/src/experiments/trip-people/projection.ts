import { normalizeSearchText } from '../../fixtures/search-text';
import { planAvailability, planFindings } from './availability';

import type { PeopleFilters, PeopleRow, TripPeopleState, TripPersonPlan } from './types';

function sourceFacts(row: PeopleRow): string[] {
  const person = row.contact?.person;
  if (!person) return [];
  return [
    person.name,
    person.notes,
    ...person.methods.flatMap((method) => [method.kind, method.label, method.value]),
    ...person.addresses.flatMap((address) => [address.label, address.city, address.address]),
  ];
}

function projectPlan(state: TripPeopleState, plan: TripPersonPlan): PeopleRow {
  const contact = state.contacts.find((entry) => entry.id === plan.contactId);
  const visit = state.visits.find((entry) => entry.id === plan.visitId);
  return {
    id: plan.id,
    plan,
    contact,
    personName: contact?.person.name ?? 'Contact unavailable',
    visit,
    visitLabel: visit?.name ?? (plan.visitId ? 'Visit unavailable' : ''),
    availability: planAvailability(state, plan),
    findings: planFindings(state, plan),
  };
}

/** Projects the same plan identities in source order and searches only selected person, plan and visit facts. */
export function peopleRows(state: TripPeopleState, filters: PeopleFilters): PeopleRow[] {
  const query = normalizeSearchText(filters.query.trim());
  return state.plans.flatMap((plan): PeopleRow[] => {
    if (filters.intention && plan.intention !== filters.intention) return [];
    if (filters.agreement && plan.agreement !== filters.agreement) return [];
    if (filters.visitId && plan.visitId !== filters.visitId) return [];
    const row = projectPlan(state, plan);
    const visit = row.visit;
    const facts = [
      plan.title,
      plan.notes,
      plan.intention,
      plan.agreement,
      plan.from,
      plan.to,
      visit?.name ?? '',
      ...sourceFacts(row),
    ];
    return facts.some((value) => normalizeSearchText(value).includes(query)) ? [row] : [];
  });
}

/** Groups the identical supplied rows by exact route visit order or source contact identity, never by equal names. */
export function groupPeopleRows(
  state: TripPeopleState,
  rows: PeopleRow[],
  mode: 'route' | 'people'
): { id: string; name: string; rows: PeopleRow[] }[] {
  const groups = new Map<string, { id: string; name: string; rows: PeopleRow[] }>();
  for (const row of rows) {
    const id = mode === 'people' ? row.plan.contactId : row.plan.visitId;
    const name = mode === 'people' ? row.personName : row.visitLabel || 'No visit selected';
    const group = groups.get(id) ?? { id, name, rows: [] };
    group.rows.push(row);
    groups.set(id, group);
  }
  if (mode === 'people')
    return [...groups.values()].toSorted(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    );
  return [...groups.values()].toSorted((left, right) => {
    const a = state.visits.findIndex((visit) => visit.id === left.id);
    const b = state.visits.findIndex((visit) => visit.id === right.id);
    if (a === b) return 0;
    if (a < 0) return 1;
    if (b < 0) return -1;
    return a - b;
  });
}
