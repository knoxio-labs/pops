/**
 * Invariant tests for the institutions service against an in-memory SQLite
 * carrying the migrated finance schema — DB + service layer only.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  InstitutionConflictError,
  InstitutionInUseError,
  InstitutionNotFoundError,
} from '../errors.js';
import { createAccount } from '../services/accounts.js';
import {
  createInstitution,
  deleteInstitution,
  getInstitution,
  isInstitutionInUse,
  listInstitutions,
  updateInstitution,
} from '../services/institutions.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

describe('listInstitutions', () => {
  it('starts with the two migration-seeded institutions and adds created rows, ordered by name', () => {
    const db = freshDb();
    expect(listInstitutions(db).map((r) => r.name)).toEqual(['ANZ', 'Amex']);

    createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    createInstitution(db, { name: 'CBA', colour: '#facc15' });

    const names = listInstitutions(db).map((r) => r.name);
    expect(names).toEqual(['ANZ', 'Amex', 'CBA', 'Westpac']);
  });
});

describe('createInstitution', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts an institution with a generated id and no logo', () => {
    const created = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });

    expect(created.name).toBe('Westpac');
    expect(created.colour).toBe('#d5001c');
    expect(created.logoAssetId).toBeNull();
    expect(created.id).toEqual(expect.any(String));
    expect(created.id.length).toBeGreaterThan(0);
  });

  it('round-trips through getInstitution', () => {
    const created = createInstitution(db, { name: 'CBA', colour: '#facc15' });
    expect(getInstitution(db, created.id).name).toBe('CBA');
  });

  it('throws InstitutionConflictError for a duplicate name', () => {
    createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    expect(() => createInstitution(db, { name: 'Westpac', colour: '#000000' })).toThrow(
      InstitutionConflictError
    );
  });

  it('throws InstitutionConflictError for a name differing only in case', () => {
    createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    expect(() => createInstitution(db, { name: 'westpac', colour: '#000000' })).toThrow(
      InstitutionConflictError
    );
    expect(() => createInstitution(db, { name: 'W.e.s.t.p.a.c', colour: '#000000' })).not.toThrow();
  });

  it('throws InstitutionConflictError for the migration-seeded "Amex" name, case-insensitively', () => {
    expect(() => createInstitution(db, { name: 'amex', colour: '#000000' })).toThrow(
      InstitutionConflictError
    );
  });
});

describe('getInstitution', () => {
  it('throws InstitutionNotFoundError for a missing id', () => {
    const db = freshDb();
    expect(() => getInstitution(db, 'missing-id')).toThrow(InstitutionNotFoundError);
  });
});

describe('isInstitutionInUse', () => {
  it('is false for an institution nothing references', () => {
    const db = freshDb();
    const created = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    expect(isInstitutionInUse(db, created.id)).toBe(false);
  });

  it('is true once an account references it (accounts.institution_id, POPS-2767)', () => {
    const db = freshDb();
    const created = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    createAccount(db, {
      name: 'Westpac Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: created.id,
    });

    expect(isInstitutionInUse(db, created.id)).toBe(true);
  });
});

describe('updateInstitution', () => {
  it('renames and recolours an institution', () => {
    const db = freshDb();
    const created = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });

    const updated = updateInstitution(db, created.id, { name: 'Westpac Bank', colour: '#000000' });

    expect(updated.name).toBe('Westpac Bank');
    expect(updated.colour).toBe('#000000');
  });

  it('leaves fields untouched when omitted from the patch', () => {
    const db = freshDb();
    const created = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });

    const updated = updateInstitution(db, created.id, { colour: '#000000' });

    expect(updated.name).toBe('Westpac');
    expect(updated.colour).toBe('#000000');
  });

  it('throws InstitutionNotFoundError for a missing id', () => {
    const db = freshDb();
    expect(() => updateInstitution(db, 'missing-id', { name: 'X' })).toThrow(
      InstitutionNotFoundError
    );
  });

  it('throws InstitutionConflictError renaming to a name that already exists, case-insensitively', () => {
    const db = freshDb();
    createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    const created = createInstitution(db, { name: 'CBA', colour: '#facc15' });

    expect(() => updateInstitution(db, created.id, { name: 'westpac' })).toThrow(
      InstitutionConflictError
    );
  });

  it('can still rename an institution an account references', () => {
    const db = freshDb();
    const created = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    createAccount(db, {
      name: 'Westpac Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: created.id,
    });

    expect(updateInstitution(db, created.id, { name: 'Westpac Bank' }).name).toBe('Westpac Bank');
  });
});

describe('deleteInstitution', () => {
  it('deletes an unused institution', () => {
    const db = freshDb();
    const created = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });

    deleteInstitution(db, created.id);

    expect(() => getInstitution(db, created.id)).toThrow(InstitutionNotFoundError);
  });

  it('throws InstitutionNotFoundError deleting a missing id', () => {
    const db = freshDb();
    expect(() => deleteInstitution(db, 'missing-id')).toThrow(InstitutionNotFoundError);
  });

  it('throws InstitutionInUseError deleting an institution an account references', () => {
    const db = freshDb();
    const created = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    createAccount(db, {
      name: 'Westpac Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: created.id,
    });

    expect(() => deleteInstitution(db, created.id)).toThrow(InstitutionInUseError);
  });
});
