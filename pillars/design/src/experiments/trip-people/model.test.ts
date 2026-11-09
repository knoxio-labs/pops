import { describe, expect, it } from 'vitest';

import { createTripPeopleState } from './fixtures';
import {
  groupPeopleRows,
  linkTripPerson,
  peopleRows,
  removeTripPersonPlan,
  saveTripPersonPlan,
  type PeopleFilters,
} from './model';

const all: PeopleFilters = { query: '', intention: '', agreement: '', visitId: '' };

describe('same identities in both trip people views', () => {
  it('keeps repeated names and recurring city visits distinct while grouping the same source rows', () => {
    const state = createTripPeopleState();
    const before = structuredClone(state);
    const rows = peopleRows(state, all);
    const people = groupPeopleRows(state, rows, 'people');
    expect(
      people
        .filter((group) => group.name === 'Marina Duarte')
        .map((group) => group.id)
        .toSorted()
    ).toEqual(['contact-marina', 'contact-marina-other']);
    const route = groupPeopleRows(state, rows, 'route');
    expect(route.filter((group) => group.name === 'Sydney').map((group) => group.id)).toEqual([
      'sydney-out',
      'sydney-return',
    ]);
    for (const groups of [people, route])
      expect(
        groups
          .flatMap((group) => group.rows)
          .map((row) => row.id)
          .toSorted()
      ).toEqual(rows.map((row) => row.id).toSorted());
    expect(rows[0]?.contact).toBe(state.contacts[0]);
    expect(state).toEqual(before);
  });

  it('searches actual selected person facts with accent folding and ANDs independent planning filters', () => {
    const state = createTripPeopleState();
    expect(peopleRows(state, { ...all, query: 'GUAIBA' }).map((row) => row.id)).toEqual([
      'plan-marina',
    ]);
    expect(
      peopleRows(state, { ...all, query: 'marina@studio.example.test' }).map((row) => row.id)
    ).toEqual(['plan-marina']);
    expect(peopleRows(state, { ...all, query: 'Rua das Flores' }).map((row) => row.id)).toEqual([
      'plan-marina',
    ]);
    expect(
      peopleRows(state, {
        ...all,
        intention: 'Planned',
        agreement: 'Agreed',
        visitId: 'family',
      }).map((row) => row.id)
    ).toEqual(['plan-marina']);
    expect(peopleRows(state, { ...all, intention: 'Considering', agreement: 'Agreed' })).toEqual(
      []
    );
    expect(peopleRows(state, { ...all, query: 'unlinked catalogue contact' })).toEqual([]);
  });

  it('exposes missing sources without substituting equal names, hiding records or searching functional fallback labels', () => {
    const state = createTripPeopleState('missing-reference');
    const row = peopleRows(state, all)[0];
    expect(row).toMatchObject({
      personName: 'Contact unavailable',
      visitLabel: 'Visit unavailable',
    });
    expect(row?.contact).toBeUndefined();
    expect(row?.availability).toEqual([]);
    expect(row?.findings.map((finding) => finding.id)).toEqual([
      'missing-contact',
      'missing-visit',
    ]);
    expect(peopleRows(state, { ...all, query: 'Contact unavailable' })).toEqual([]);
    expect(peopleRows(createTripPeopleState('empty'), all)).toEqual([]);
    expect(
      peopleRows(createTripPeopleState('undated'), all).every((entry) => !entry.availability.length)
    ).toBe(true);
  });
});

describe('local person associations and meeting edits', () => {
  it('links a known contact without assumed dates, availability, route membership or contact changes', () => {
    const state = createTripPeopleState('empty');
    const linked = linkTripPerson(state, 'contact-marina', 'new-plan');
    expect(linked.error).toBeNull();
    expect(linked.state.plans).toEqual([
      {
        id: 'new-plan',
        contactId: 'contact-marina',
        visitId: '',
        title: '',
        notes: '',
        intention: 'Considering',
        agreement: 'Not agreed',
        from: '',
        to: '',
      },
    ]);
    expect(linked.state.contacts).toBe(state.contacts);
    expect(linked.state.visits).toBe(state.visits);
    expect(linked.state.cities).toBe(state.cities);
    expect(state.plans).toEqual([]);
    expect(
      linkTripPerson(linked.state, 'contact-marina-other', 'another').state.plans
    ).toHaveLength(2);
    expect(
      linkTripPerson(linked.state, 'contact-marina', 'second-meeting').state.plans
    ).toHaveLength(2);
    for (const [contactId, id] of [
      ['missing', 'new'],
      ['', 'new'],
      ['contact-marina', ''],
      ['contact-marina', 'new-plan'],
    ] as const) {
      const result = linkTripPerson(linked.state, contactId, id);
      expect(result.state).toBe(linked.state);
      expect(result.error).not.toBeNull();
    }
  });

  it('edits planning, agreement, optional visit and dates independently while preserving sources and prior undo snapshots', () => {
    const state = createTripPeopleState();
    const plan = state.plans[0];
    if (!plan) throw new Error('Missing source plan');
    const before = structuredClone(state);
    const draft = {
      ...plan,
      notes: 'Ask tomorrow.',
      intention: 'Considering' as const,
      agreement: 'Agreed' as const,
      from: '',
      to: '',
      visitId: '',
    };
    const changed = saveTripPersonPlan(state, draft);
    expect(changed.error).toBeNull();
    expect(changed.state.plans[0]).toEqual(draft);
    expect(changed.state.contacts).toBe(state.contacts);
    expect(changed.state.visits).toBe(state.visits);
    draft.notes = 'Draft only';
    expect(changed.state.plans[0]?.notes).toBe('Ask tomorrow.');
    expect(state).toEqual(before);
    const removed = removeTripPersonPlan(changed.state, plan.id);
    expect(removed.plans.some((entry) => entry.id === plan.id)).toBe(false);
    expect(changed.state.plans[0]?.id).toBe(plan.id);
    expect(removed.contacts).toBe(state.contacts);
    expect(removeTripPersonPlan(state, 'missing')).toBe(state);
  });

  it('retains unchanged broken references for notes edits but rejects newly selected unknown sources or invalid dates', () => {
    const state = createTripPeopleState('missing-reference');
    const plan = state.plans[0];
    if (!plan) throw new Error('Missing broken plan fixture');
    const changed = saveTripPersonPlan(state, {
      ...plan,
      notes: 'Keep the original association visible.',
    });
    expect(changed.error).toBeNull();
    expect(changed.state.plans[0]).toMatchObject({
      contactId: 'removed-contact',
      visitId: 'removed-visit',
    });
    for (const patch of [
      { contactId: 'another-missing' },
      { contactId: '' },
      { visitId: 'another-missing' },
      { from: '2027-02-30' },
      { from: '2027-12-26', to: '2027-12-24' },
    ]) {
      const result = saveTripPersonPlan(state, { ...plan, ...patch });
      expect(result.state).toBe(state);
      expect(result.error).not.toBeNull();
    }
    expect(saveTripPersonPlan(state, { ...plan, id: 'removed-plan' }).state).toBe(state);
    expect(removeTripPersonPlan(state, plan.id).contacts).toBe(state.contacts);
    state.contacts[0]?.person.methods.splice(0, 1);
    expect(createTripPeopleState().contacts[0]?.person.methods).toHaveLength(4);
  });
});
