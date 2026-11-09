import { describe, expect, it } from 'vitest';

import { createArrangementState } from './fixture';
import {
  arrangementResponsibility,
  arrangementRows,
  clearArrangementResponsibility,
  setArrangementResponsibility,
  visibleArrangements,
} from './model';

describe('explicit optional handled-by associations', () => {
  it('shows source-selected self, another contact and absence without inferring responsibility', () => {
    const state = createArrangementState();
    const rows = arrangementRows(state);
    expect(rows.some((row) => row.responsible?.self === true)).toBe(true);
    expect(rows.some((row) => row.responsible?.self === false)).toBe(true);
    expect(rows.some((row) => row.responsible === undefined)).toBe(true);
    expect(arrangementResponsibility(state, 'unassigned')).toBeUndefined();
    const other = state.contacts.find((contact) => !contact.self);
    const self = state.contacts.find((contact) => contact.self);
    if (!other || !self) throw new Error('Missing fictional contact identities');
    other.name = self.name;
    expect(
      arrangementRows(state).some(
        (row) => row.responsible?.contactId === other.id && row.responsible.self === false
      )
    ).toBe(true);
  });

  it('chooses and replaces a known contact immutably while preserving booking, policy and contact sources', () => {
    const state = createArrangementState();
    const row = arrangementRows(state).find((entry) => !entry.responsible);
    if (!row) throw new Error('Missing unassigned arrangement fixture');
    const before = structuredClone(state);
    const chosen = setArrangementResponsibility(state, row.id, 'contact-clara');
    expect(chosen.error).toBeNull();
    expect(arrangementResponsibility(chosen.state, row.id)).toMatchObject({
      label: 'Clara Silva',
      self: false,
      available: true,
    });
    expect(chosen.state.canvas).toBe(state.canvas);
    expect(chosen.state.policies).toBe(state.policies);
    expect(chosen.state.contacts).toBe(state.contacts);
    expect(state).toEqual(before);
    const replaced = setArrangementResponsibility(chosen.state, row.id, 'contact-self');
    expect(arrangementResponsibility(replaced.state, row.id)?.self).toBe(true);
    expect(
      replaced.state.responsibilities.filter((entry) => entry.recordId === row.id)
    ).toHaveLength(1);
    expect(setArrangementResponsibility(replaced.state, row.id, 'contact-self').state).toBe(
      replaced.state
    );
    expect(arrangementRows(replaced.state).find((entry) => entry.id === row.id)).toMatchObject({
      purchased: row.purchased,
      status: row.status,
      intention: row.intention,
    });
  });

  it('rejects unavailable records and contacts atomically without substituting self or clearing an association', () => {
    const state = createArrangementState();
    const row = arrangementRows(state)[0];
    if (!row) throw new Error('Missing arrangement fixture');
    for (const [recordId, contactId] of [
      [row.id, ''],
      [row.id, 'unknown'],
      ['', 'contact-self'],
      ['unknown', 'contact-self'],
    ] as const) {
      const result = setArrangementResponsibility(state, recordId, contactId);
      expect(result.state).toBe(state);
      expect(result.error).not.toBeNull();
    }
  });

  it('keeps missing contact references explicit and removable without deleting source contacts or records', () => {
    const state = createArrangementState('missing-reference');
    const row = arrangementRows(state).find((entry) => entry.responsible?.available === false);
    if (!row) throw new Error('Missing broken responsibility fixture');
    expect(row.responsible).toEqual({
      contactId: 'removed-contact',
      label: 'Contact unavailable',
      available: false,
    });
    const cleared = clearArrangementResponsibility(state, row.id);
    expect(arrangementResponsibility(cleared, row.id)).toBeUndefined();
    expect(cleared.canvas).toBe(state.canvas);
    expect(cleared.contacts).toBe(state.contacts);
    expect(arrangementResponsibility(state, row.id)?.contactId).toBe('removed-contact');
    expect(clearArrangementResponsibility(cleared, row.id)).toBe(cleared);
    expect(
      visibleArrangements(state, { query: 'Contact unavailable', kind: '', purchase: 'all' })
    ).toEqual([]);
  });
});

describe('independent source planning and arrangement facts', () => {
  it('distinguishes free events, considering ideas and booked arrangements without inferring required tasks', () => {
    const state = createArrangementState();
    const rows = arrangementRows(state);
    const free = rows.find((row) => row.kind === 'event' && row.status === 'Not needed');
    const considering = rows.find((row) => row.kind === 'event' && row.intention === 'Considering');
    const booked = rows.find(
      (row) => row.kind === 'stay' && row.status === 'Booked' && !row.purchased
    );
    expect(free).toMatchObject({ intention: 'In plan', status: 'Not needed', purchased: false });
    expect(considering).toMatchObject({
      intention: 'Considering',
      status: 'Not arranged',
      purchased: false,
    });
    expect(booked).toMatchObject({ intention: 'In plan', status: 'Booked', purchased: false });
    expect(rows.find((row) => row.kind === 'rental')?.intention).toBe('');
    if (!free) throw new Error('Missing free event fixture');
    const changed = setArrangementResponsibility(state, free.id, 'contact-self');
    expect(arrangementRows(changed.state).find((row) => row.id === free.id)).toMatchObject({
      intention: free.intention,
      status: free.status,
      purchased: free.purchased,
    });
  });

  it('retains original snapshots for undo and searches only the explicitly associated contact', () => {
    const state = createArrangementState();
    const rows = arrangementRows(state);
    const row = rows.find((entry) => entry.responsible?.contactId === 'contact-clara');
    if (!row) throw new Error('Missing other-contact assignment fixture');
    expect(
      visibleArrangements(state, { query: 'Clara Silva', kind: '', purchase: 'all' }).map(
        (entry) => entry.id
      )
    ).toEqual([row.id]);
    const cleared = clearArrangementResponsibility(state, row.id);
    expect(
      visibleArrangements(cleared, { query: 'Clara Silva', kind: '', purchase: 'all' })
    ).toEqual([]);
    expect(arrangementResponsibility(state, row.id)?.label).toBe('Clara Silva');
    state.contacts.splice(0, 1);
    expect(createArrangementState().contacts).toHaveLength(2);
  });
});
