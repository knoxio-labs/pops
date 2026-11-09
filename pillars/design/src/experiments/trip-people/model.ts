import { planDateFindings } from './availability';

import type { TripPeopleState, TripPersonPlan } from './types';

/** Public source types and pure projections for the local trip-people prototype. */
export type {
  TripPeopleContact,
  TripPeopleVisit,
  TripPersonPlan,
  TripPeopleState,
  PeopleFilters,
  PeopleFinding,
  PeopleRow,
  PeopleScenario,
} from './types';
export { peopleRows, groupPeopleRows } from './projection';
export { planAvailability, planFindings } from './availability';

/** Links a known contact as a distinct undated meeting intention without changing the contact or route sources. */
export function linkTripPerson(
  state: TripPeopleState,
  contactId: string,
  newPlanId: string
): { state: TripPeopleState; error: string | null } {
  if (!state.contacts.some((contact) => contact.id === contactId))
    return { state, error: 'Choose an available contact.' };
  if (!newPlanId.trim() || state.plans.some((plan) => plan.id === newPlanId))
    return { state, error: 'Choose a distinct plan identifier.' };
  const plan: TripPersonPlan = {
    id: newPlanId,
    contactId,
    visitId: '',
    title: '',
    notes: '',
    intention: 'Considering',
    agreement: 'Not agreed',
    from: '',
    to: '',
  };
  return { state: { ...state, plans: [...state.plans, plan] }, error: null };
}

/** Saves an existing local plan; unchanged broken references survive independent notes edits, while new references must resolve. */
export function saveTripPersonPlan(
  state: TripPeopleState,
  plan: TripPersonPlan
): { state: TripPeopleState; error: string | null } {
  const existing = state.plans.find((entry) => entry.id === plan.id);
  if (!existing) return { state, error: 'This plan is unavailable.' };
  if (
    plan.contactId !== existing.contactId &&
    !state.contacts.some((contact) => contact.id === plan.contactId)
  )
    return { state, error: 'Choose an available contact.' };
  if (
    plan.visitId &&
    plan.visitId !== existing.visitId &&
    !state.visits.some((visit) => visit.id === plan.visitId)
  )
    return { state, error: 'Choose an available visit or clear the selection.' };
  const finding = planDateFindings(plan)[0];
  if (finding) return { state, error: finding.message };
  return {
    state: {
      ...state,
      plans: state.plans.map((entry) => (entry.id === plan.id ? { ...plan } : entry)),
    },
    error: null,
  };
}

/** Removes only a trip meeting association, including broken references; contact identities and source plans remain intact. */
export function removeTripPersonPlan(state: TripPeopleState, id: string): TripPeopleState {
  return state.plans.some((plan) => plan.id === id)
    ? { ...state, plans: state.plans.filter((plan) => plan.id !== id) }
    : state;
}
