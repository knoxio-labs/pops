/**
 * Invariant tests for the institutions service against an in-memory SQLite
 * carrying the migrated finance schema — DB + service layer only.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  InstitutionConflictError,
  InstitutionInUseError,
  InstitutionMergeSameInstitutionError,
  InstitutionNotFoundError,
  LogoBlobNotFoundError,
} from '../errors.js';
import { getAccount, createAccount } from '../services/accounts.js';
import {
  createInstitution,
  deleteInstitution,
  getInstitution,
  isInstitutionInUse,
  listInstitutions,
  mergeInstitutions,
  updateInstitution,
} from '../services/institutions.js';
import { createLogoBlob, getLogoBlob } from '../services/logo-blobs.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';
import type { MigratedFinanceDb } from './migrated-db.js';

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

  it("deletes the institution's logo_blobs row along with it (POPS-2867)", () => {
    const db = freshDb();
    const blob = createLogoBlob(db, { contentType: 'image/png', data: Buffer.from('logo-bytes') });
    const created = createInstitution(db, {
      name: 'Westpac',
      colour: '#d5001c',
      logoAssetId: blob.id,
    });

    deleteInstitution(db, created.id);

    expect(() => getLogoBlob(db, blob.id)).toThrow(LogoBlobNotFoundError);
  });
});

describe('mergeInstitutions', () => {
  it('repoints every account referencing the source onto the target and removes the source', () => {
    const db = freshDb();
    const source = createInstitution(db, { name: 'A.N.Z.', colour: '#d5001c' });
    const target = createInstitution(db, { name: 'ANZ Bank', colour: '#0033a0' });
    const checking = createAccount(db, {
      name: 'Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: source.id,
    });
    const savings = createAccount(db, {
      name: 'Savings',
      kind: 'savings',
      currency: 'AUD',
      institutionId: source.id,
    });

    const survivor = mergeInstitutions(db, source.id, target.id);

    expect(survivor.id).toBe(target.id);
    expect(getAccount(db, checking.id).institutionId).toBe(target.id);
    expect(getAccount(db, savings.id).institutionId).toBe(target.id);
    expect(() => getInstitution(db, source.id)).toThrow(InstitutionNotFoundError);
  });

  it('keeps the target colour and logoAssetId unqualified — the source values are discarded', () => {
    const db = freshDb();
    const source = createInstitution(db, {
      name: 'A.N.Z.',
      colour: '#111111',
      logoAssetId: 'asset-source',
    });
    const target = createInstitution(db, {
      name: 'ANZ Bank',
      colour: '#0033a0',
      logoAssetId: 'asset-target',
    });

    const survivor = mergeInstitutions(db, source.id, target.id);

    expect(survivor.colour).toBe('#0033a0');
    expect(survivor.logoAssetId).toBe('asset-target');
  });

  it("deletes the source institution's logo_blobs row, keeping the target's (POPS-2867)", () => {
    const db = freshDb();
    const sourceBlob = createLogoBlob(db, {
      contentType: 'image/png',
      data: Buffer.from('source-logo'),
    });
    const targetBlob = createLogoBlob(db, {
      contentType: 'image/png',
      data: Buffer.from('target-logo'),
    });
    const source = createInstitution(db, {
      name: 'A.N.Z.',
      colour: '#111111',
      logoAssetId: sourceBlob.id,
    });
    const target = createInstitution(db, {
      name: 'ANZ Bank',
      colour: '#0033a0',
      logoAssetId: targetBlob.id,
    });

    mergeInstitutions(db, source.id, target.id);

    expect(() => getLogoBlob(db, sourceBlob.id)).toThrow(LogoBlobNotFoundError);
    expect(getLogoBlob(db, targetBlob.id)).toBeTruthy();
  });

  it('merges two institutions that no account references (nothing to repoint, still deletes source)', () => {
    const db = freshDb();
    const source = createInstitution(db, { name: 'A.N.Z.', colour: '#d5001c' });
    const target = createInstitution(db, { name: 'ANZ Bank', colour: '#0033a0' });

    expect(() => mergeInstitutions(db, source.id, target.id)).not.toThrow();
    expect(() => getInstitution(db, source.id)).toThrow(InstitutionNotFoundError);
  });

  it('throws InstitutionMergeSameInstitutionError and writes nothing for a self-merge', () => {
    const db = freshDb();
    const institution = createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    const account = createAccount(db, {
      name: 'Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: institution.id,
    });

    expect(() => mergeInstitutions(db, institution.id, institution.id)).toThrow(
      InstitutionMergeSameInstitutionError
    );
    expect(getInstitution(db, institution.id)).toBeTruthy();
    expect(getAccount(db, account.id).institutionId).toBe(institution.id);
  });

  it('throws InstitutionNotFoundError, not InstitutionMergeSameInstitutionError, for a self-merge of a nonexistent id', () => {
    const db = freshDb();
    expect(() => mergeInstitutions(db, 'missing-id', 'missing-id')).toThrow(
      InstitutionNotFoundError
    );
  });

  it('throws InstitutionNotFoundError for an unknown source id', () => {
    const db = freshDb();
    const target = createInstitution(db, { name: 'ANZ Bank', colour: '#0033a0' });
    expect(() => mergeInstitutions(db, 'missing-id', target.id)).toThrow(InstitutionNotFoundError);
  });

  it('throws InstitutionNotFoundError for an unknown target id, and repoints nothing', () => {
    const db = freshDb();
    const source = createInstitution(db, { name: 'A.N.Z.', colour: '#d5001c' });
    const account = createAccount(db, {
      name: 'Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: source.id,
    });

    expect(() => mergeInstitutions(db, source.id, 'missing-id')).toThrow(InstitutionNotFoundError);
    expect(getAccount(db, account.id).institutionId).toBe(source.id);
    expect(getInstitution(db, source.id)).toBeTruthy();
  });

  it('rolls back the whole merge (leaving no account pointing at a deleted institution) when the delete step fails mid-transaction', () => {
    const migrated: MigratedFinanceDb = freshMigratedFinanceDb();
    const { db, raw } = migrated;
    const source = createInstitution(db, { name: 'A.N.Z.', colour: '#d5001c' });
    const target = createInstitution(db, { name: 'ANZ Bank', colour: '#0033a0' });
    const account = createAccount(db, {
      name: 'Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: source.id,
    });

    raw
      .prepare(
        `CREATE TRIGGER fail_source_delete BEFORE DELETE ON institutions
         WHEN OLD.id = '${source.id}'
         BEGIN SELECT RAISE(ABORT, 'simulated mid-merge failure'); END`
      )
      .run();

    expect(() => mergeInstitutions(db, source.id, target.id)).toThrow(
      /simulated mid-merge failure/
    );

    expect(getAccount(db, account.id).institutionId).toBe(source.id);
    expect(getInstitution(db, source.id)).toBeTruthy();
  });
});
