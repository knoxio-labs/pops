import { describe, expect, it } from 'vitest';

import { createTripPeopleState } from './fixtures';
import { planAvailability, planFindings } from './model';

function sourceWindow() {
  const state = createTripPeopleState();
  const plan = state.plans[0];
  const contact = state.contacts[0];
  if (!plan || !contact) throw new Error('Missing approved person and plan fixture');
  state.visits = [
    {
      id: plan.visitId,
      cityId: 'porto-alegre',
      name: 'Porto Alegre',
      from: '2027-12-20',
      to: '2027-12-29',
    },
  ];
  return { state, plan, contact };
}

describe('inclusive source availability windows', () => {
  it('retains the exact source identity and exposes typed inclusive overlap bounds', () => {
    const { state, plan, contact } = sourceWindow();
    const windows = planAvailability(state, plan);
    expect(windows).toMatchObject([
      { from: '2027-12-20', to: '2027-12-28', overlap: '2027-12-20 → 2027-12-28' },
    ]);
    expect(windows[0]?.source).toBe(contact.person.availability[0]);
    state.visits = state.visits.map((visit) => ({
      ...visit,
      from: '2027-12-28',
      to: '2027-12-28',
    }));
    expect(planAvailability(state, plan)).toMatchObject([{ from: '2027-12-28', to: '2027-12-28' }]);
    state.visits = state.visits.map((visit) => ({ ...visit, from: '2027-12-29' }));
    expect(planAvailability(state, plan)).toEqual([]);
  });

  it.each([
    ['', '2027-12-28'],
    ['2027-12', '2027-12-28'],
    ['Around July', ''],
    ['2027-02-30', '2027-12-28'],
    ['2027-12-28', '2027-12-19'],
  ])('does not infer an exact source availability window from %j through %j', (start, end) => {
    const { state, plan, contact } = sourceWindow();
    contact.person.availability = [
      { id: 'manual', city: 'porto-alegre', start, end, status: 'Unavailable' },
    ];
    expect(planAvailability(state, plan)).toEqual([]);
    expect(planFindings(state, plan).some((finding) => finding.id === 'meeting-unavailable')).toBe(
      false
    );
  });

  it('requires an exact selected visit and source city rather than matching a city display name', () => {
    const { state, plan, contact } = sourceWindow();
    contact.person.availability = contact.person.availability.map((source) => ({
      ...source,
      city: 'Porto Alegre',
    }));
    expect(planAvailability(state, plan)).toEqual([]);
    plan.visitId = 'missing';
    expect(planAvailability(state, plan)).toEqual([]);
    expect(planFindings(state, plan)).toContainEqual({
      id: 'missing-visit',
      message: 'The selected visit is unavailable.',
    });
  });
});

describe('explicit meeting incompatibilities', () => {
  it('reports exact meeting unavailability even when the selected route visit is open', () => {
    const { state, plan, contact } = sourceWindow();
    contact.person.availability = [
      {
        id: 'unavailable',
        city: 'porto-alegre',
        start: '2027-12-24',
        end: '2027-12-24',
        status: 'Unavailable',
      },
    ];
    state.visits = state.visits.map((visit) => ({ ...visit, from: '', to: '' }));
    expect(planAvailability(state, plan)).toEqual([]);
    expect(planFindings(state, plan)).toContainEqual({
      id: 'meeting-unavailable',
      message: 'The selected dates overlap recorded unavailability.',
    });
    plan.from = '';
    plan.to = '';
    expect(planFindings(state, plan).some((finding) => finding.id === 'meeting-unavailable')).toBe(
      false
    );
  });

  it('distinguishes contradictory source statements from unknown or absent availability without hardening agreement', () => {
    const state = createTripPeopleState('conflicting');
    const plan = state.plans[0];
    const contact = state.contacts[0];
    if (!plan || !contact) throw new Error('Missing conflicting source fixture');
    expect(state.visits.find((visit) => visit.id === plan.visitId)).toMatchObject({
      from: '2027-12-20',
      to: '2027-12-29',
    });
    expect(createTripPeopleState().visits.find((visit) => visit.id === plan.visitId)?.from).toBe(
      ''
    );
    expect(
      planFindings(state, plan).some((finding) => finding.id === 'availability-conflict')
    ).toBe(true);
    expect(planFindings(state, plan).some((finding) => finding.id === 'meeting-unavailable')).toBe(
      true
    );
    expect(plan).not.toHaveProperty('purchased');
    expect(plan).not.toHaveProperty('hard');
    contact.person.availability = contact.person.availability.map((source) => ({
      ...source,
      status: 'Unknown',
    }));
    expect(
      planFindings(state, plan).some(
        (finding) => finding.id === 'availability-conflict' || finding.id === 'meeting-unavailable'
      )
    ).toBe(false);
    contact.person.availability = [];
    expect(planAvailability(state, plan)).toEqual([]);
    expect(planFindings(state, plan)).toEqual([]);
  });

  it('validates explicit plan dates without deriving outside-visit conflicts from reversed or open source bounds', () => {
    const { state, plan } = sourceWindow();
    plan.from = '2027-02-30';
    expect(planFindings(state, plan).some((finding) => finding.id === 'invalid-from')).toBe(true);
    plan.from = '2027-12-25';
    plan.to = '2027-12-24';
    expect(planFindings(state, plan).some((finding) => finding.id === 'reversed-dates')).toBe(true);
    plan.from = '2027-12-19';
    plan.to = '2027-12-19';
    expect(planFindings(state, plan).some((finding) => finding.id === 'outside-visit')).toBe(true);
    state.visits = state.visits.map((visit) => ({
      ...visit,
      from: '2027-12-29',
      to: '2027-12-20',
    }));
    expect(planFindings(state, plan).some((finding) => finding.id === 'outside-visit')).toBe(false);
  });
});
