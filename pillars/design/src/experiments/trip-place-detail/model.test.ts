import { describe, expect, it } from 'vitest';

import { initialIdea } from './fixture';
import { ideaFindings, ideaTimingLabel, safeIdeaUrl } from './model';

describe('idea sources', () => {
  it('keeps empty selections empty while retaining catalogues', () => {
    const empty = initialIdea('empty');
    expect([
      empty.name,
      empty.reason,
      empty.address,
      empty.cityId,
      empty.visitId,
      empty.notes,
    ]).toEqual(Array<string>(6).fill(''));
    expect(empty.timing).toEqual({ mode: 'none', month: '', from: '', to: '' });
    expect(empty.kind).toBe('place');
    expect(empty.purpose).toBe('other');
    expect([empty.links, empty.recommendations]).toEqual([[], []]);
    expect(empty.cities).toHaveLength(3);
    expect(empty.visits).toHaveLength(3);
    expect(ideaFindings(empty)).toEqual([]);
    expect(ideaTimingLabel(empty)).toBe('');
  });

  it('does not mutate source snapshots or share mutable fixture data', () => {
    const state = initialIdea();
    const before = structuredClone(state);
    ideaFindings(state);
    ideaTimingLabel(state);
    expect(state).toEqual(before);
    state.contacts.length = 0;
    expect(initialIdea().contacts).toHaveLength(2);
  });

  it('reports unavailable selected references without exposing their identifiers', () => {
    const findings = ideaFindings(initialIdea('missing-reference'));
    expect(findings.map(({ id }) => id)).toEqual([
      'missing-city',
      'missing-visit',
      'missing-contact',
    ]);
    expect(JSON.stringify(findings)).not.toContain('removed-');
  });

  it('ignores blank optional contact selections and absent link fields', () => {
    const state = initialIdea('empty');
    state.recommendations = [{ id: 'note', contactId: '', note: 'A note with no linked contact' }];
    state.links = [{ id: 'draft', label: '', url: '' }];
    expect(ideaFindings(state)).toEqual([]);
  });
});

describe('idea timing', () => {
  it('formats only captured timing and never substitutes the intended visit', () => {
    expect(ideaTimingLabel(initialIdea())).toBe('Jan 2028');
    expect(ideaFindings(initialIdea())).toEqual([]);
    expect(ideaTimingLabel(initialIdea('undated'))).toBe('');
    const state = initialIdea();
    state.timing = { mode: 'dates', month: '', from: '2028-01-22', to: '' };
    expect(ideaTimingLabel(state)).toBe('22 Jan 2028');
    expect(ideaFindings(state)).toEqual([]);
  });

  it.each(['2028-00', '2028-13', '2028-1', 'invalid'])('rejects invalid month %s', (month) => {
    const state = initialIdea();
    state.timing.month = month;
    expect(ideaFindings(state).map(({ id }) => id)).toEqual(['invalid-month']);
    expect(ideaTimingLabel(state)).toBe('');
  });

  it.each(['2028-02-30', '2027-02-29', '2028-04-31', 'invalid'])(
    'rejects invalid date %s',
    (from) => {
      const state = initialIdea('empty');
      state.timing = { mode: 'dates', month: '', from, to: '' };
      expect(ideaFindings(state).map(({ id }) => id)).toEqual(['invalid-from']);
      expect(ideaTimingLabel(state)).toBe('');
    }
  );

  it('accepts a leap day and reports reversed dates separately', () => {
    const state = initialIdea('empty');
    state.timing = { mode: 'dates', month: '', from: '2028-02-29', to: '2028-02-28' };
    expect(ideaFindings(state).map(({ id }) => id)).toEqual(['reversed-dates']);
  });

  it.each(['2027-12', '2028-02'])('reports a month entirely outside the visit: %s', (month) => {
    const state = initialIdea();
    state.timing.month = month;
    expect(ideaFindings(state).map(({ id }) => id)).toEqual(['outside-visit']);
  });

  it('accepts exact visit boundaries and detects each outside bound', () => {
    const state = initialIdea();
    state.timing = { mode: 'dates', month: '', from: '2028-01-21', to: '2028-01-25' };
    expect(ideaFindings(state)).toEqual([]);
    for (const [from, to] of [
      ['2028-01-20', ''],
      ['', '2028-01-26'],
    ]) {
      state.timing = { mode: 'dates', month: '', from: from ?? '', to: to ?? '' };
      expect(ideaFindings(state).map(({ id }) => id)).toEqual(['outside-visit']);
    }
    expect(ideaFindings(initialIdea('outside-visit')).map(({ id }) => id)).toEqual([
      'outside-visit',
    ]);
  });

  it('does not infer missing visit bounds and reports city mismatch', () => {
    const state = initialIdea();
    state.visits = [{ id: 'visit-bh', cityId: 'rio', from: '', to: '' }];
    state.timing.month = '2029-01';
    expect(ideaFindings(state).map(({ id }) => id)).toEqual(['visit-city']);
    state.cityId = '';
    expect(ideaFindings(state)).toEqual([]);
  });

  it('checks known visit bounds independently and ignores invalid inactive timing', () => {
    const state = initialIdea();
    state.visits = [{ id: 'visit-bh', cityId: 'belo-horizonte', from: '', to: '2028-01-25' }];
    state.timing = { mode: 'dates', month: 'invalid', from: '', to: '2028-01-26' };
    expect(ideaFindings(state).map(({ id }) => id)).toEqual(['outside-visit']);
    state.timing.to = '2028-01-32';
    expect(ideaFindings(state).map(({ id }) => id)).toEqual(['invalid-to']);
    state.timing.mode = 'none';
    expect(ideaFindings(state)).toEqual([]);
    expect(ideaTimingLabel(state)).toBe('');
  });
});

describe('idea link navigation', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    '/relative',
    '//example.com',
    'file:///secret',
    'https:example.com',
    'http:/example.com',
    '',
    'not a URL',
  ])('rejects %s', (url) => {
    expect(safeIdeaUrl(url)).toBeUndefined();
  });

  it('allows absolute web URLs', () => {
    expect(safeIdeaUrl('https://drawing-circle.example')).toBe('https://drawing-circle.example/');
    expect(safeIdeaUrl('http://drawing-circle.example/meetups')).toBe(
      'http://drawing-circle.example/meetups'
    );
  });
});
