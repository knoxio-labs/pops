import { describe, expect, it } from 'vitest';

import { initialStay } from './fixture';
import { stayFindings, stayNights } from './model';

const ids = (state: ReturnType<typeof initialStay>) => stayFindings(state).map((item) => item.id);

describe('stay calendar nights', () => {
  it('uses an exclusive checkout boundary and accepts a real leap day', () => {
    expect(stayNights(initialStay())).toBe(4);
    expect(stayNights({ ...initialStay(), from: '2028-02-28', to: '2028-03-01' })).toBe(2);
  });
  it.each([
    ['', '2028-01-20'],
    ['2028-01-16', ''],
    ['2028-02-30', '2028-03-02'],
    ['2027-02-29', '2027-03-02'],
    ['2028-01-20', '2028-01-20'],
    ['2028-01-21', '2028-01-20'],
    ['2028-1-16', '2028-01-20'],
  ])('keeps invalid or incomplete dates unknown: %s to %s', (from, to) => {
    expect(stayNights({ ...initialStay(), from, to })).toBeUndefined();
  });
  it('counts calendar nights over daylight-saving transitions', () => {
    expect(
      stayNights({
        ...initialStay(),
        from: '2028-03-11',
        to: '2028-03-13',
        timeZone: 'America/New_York',
      })
    ).toBe(2);
  });
});

describe('stay findings', () => {
  it('accepts back-to-back stays without overlap or missing coverage', () => {
    expect(stayFindings(initialStay())).toEqual([]);
  });
  it('reports malformed, same-day and reversed intervals', () => {
    expect(ids({ ...initialStay(), from: '2028-02-30' })).toContain('dates-invalid');
    expect(ids({ ...initialStay(), to: '2028-01-16' })).toContain('dates-reversed');
    expect(ids({ ...initialStay(), from: '2028-01-21' })).toContain('dates-reversed');
  });
  it('checks known visit bounds even when the other bound is absent', () => {
    const state = initialStay();
    expect(ids({ ...state, from: '2028-01-15', visit: { ...state.visit, to: '' } })).toContain(
      'outside-visit'
    );
    expect(ids({ ...state, to: '2028-01-24', visit: { ...state.visit, from: '' } })).toContain(
      'outside-visit'
    );
  });
  it('detects adjacent overlap only inside the visit', () => {
    expect(ids(initialStay('overlap'))).toContain('overlap-1');
    const state = { ...initialStay(), from: '2028-01-14', to: '2028-01-16' };
    state.adjacent = [
      { id: 'outside', name: 'Earlier hotel', from: '2028-01-15', to: '2028-01-16' },
    ];
    expect(ids(state).some((id) => id.startsWith('overlap'))).toBe(false);
  });
  it('reports exact uncovered nights within a fully known visit', () => {
    const state = { ...initialStay(), to: '2028-01-18' };
    expect(stayFindings(state)).toContainEqual(
      expect.objectContaining({
        kind: 'gap',
        title: 'Accommodation gap',
        detail: '2 nights between 2028-01-18 and 2028-01-20 have no recorded stay.',
      })
    );
  });
  it('does not invent missing night counts with incomplete coverage or visit dates', () => {
    const state = initialStay();
    const partial = { ...state, adjacent: state.adjacent.map((stay) => ({ ...stay, from: '' })) };
    expect(stayFindings(partial)).toEqual([]);
    expect(stayFindings({ ...state, visit: { ...state.visit, to: '' } })).toEqual([]);
    expect(stayFindings({ ...state, from: '' })).toEqual([]);
  });
  it('validates explicit local clocks through IANA rules', () => {
    const state = {
      ...initialStay(),
      from: '2028-03-12',
      to: '2028-03-13',
      timeZone: 'America/New_York',
      checkIn: '02:30',
    };
    expect(ids(state)).toContain('clock-zone');
    expect(ids({ ...initialStay(), checkIn: '24:00' })).toContain('clock-invalid');
    expect(ids({ ...initialStay(), timeZone: 'Invented/Zone' })).toContain('clock-zone');
    expect(ids({ ...initialStay(), to: '2028-01-16', checkOut: '14:00' })).toContain(
      'clock-reversed'
    );
  });
  it('keeps opaque reference IDs out of product finding text', () => {
    const state = {
      ...initialStay(),
      hostId: 'opaque-contact-123',
      documentIds: ['opaque-document-456'],
    };
    const text = stayFindings(state)
      .map(({ title, detail }) => `${title} ${detail}`)
      .join(' ');
    expect(text).not.toContain(state.hostId);
    expect(text).not.toContain('opaque-document-456');
    expect(text).toContain('original contact is unavailable');
    expect(text).toContain('original document is unavailable');
    expect(state.hostId).toBe('opaque-contact-123');
    expect(state.documentIds).toEqual(['opaque-document-456']);
  });
  it('never assumes clocks for a date-only stay', () => {
    expect(stayFindings({ ...initialStay(), checkIn: '', checkOut: '' })).toEqual([]);
  });
  it('retains broken reference IDs and warns only about explicitly selected references', () => {
    const state = initialStay('missing-reference');
    const before = structuredClone(state);
    expect(ids(state)).toEqual(['host-missing', 'document-document-removed']);
    expect(state).toEqual(before);
    expect(stayFindings({ ...state, hostId: '', documentIds: [] })).toEqual([]);
  });
});

describe('fictional stay snapshots', () => {
  it('retains catalogues in empty capture without preselecting optional facts', () => {
    const state = initialStay('empty');
    expect([
      state.name,
      state.reference,
      state.hostId,
      state.address,
      state.from,
      state.to,
    ]).toEqual(['', '', '', '', '', '']);
    expect(state.timeZone).toBe('');
    expect(state.documentIds).toEqual([]);
    expect(state.hosts).toHaveLength(2);
    expect(state.documents).toHaveLength(2);
    expect(stayFindings(state)).toEqual([]);
  });
  it('keeps agreed family hospitality separate from purchased accommodation', () => {
    const state = initialStay('family');
    expect(state.kind).toBe('family');
    expect(state.status).toBe('Agreed');
    expect(stayFindings(state)).toEqual([]);
    expect(state.status).toBe('Agreed');
  });
  it('creates independent editable catalogues and intervals', () => {
    const edited = initialStay();
    edited.hosts.splice(0, 1);
    edited.documents.splice(0, 1);
    edited.adjacent.splice(0, 1);
    expect(initialStay().hosts).toHaveLength(2);
    expect(initialStay().documents).toHaveLength(2);
    expect(initialStay().adjacent).toHaveLength(1);
  });
});
