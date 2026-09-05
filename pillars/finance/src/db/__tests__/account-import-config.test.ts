/**
 * Invariant tests for the account import-config service (POPS-2916,
 * ADR-052): the per-kind required field, replace-not-patch on upsert, and the
 * account cascade.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { ImportConfigInvalidError } from '../errors.js';
import { accounts } from '../schema.js';
import {
  deleteImportConfig,
  getImportConfig,
  upsertImportConfig,
} from '../services/account-import-config.js';
import { createAccount } from '../services/accounts.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;
let accountId: string;

beforeEach(() => {
  db = freshMigratedFinanceDb().db;
  accountId = createAccount(db, { name: 'Up Everyday', kind: 'checking', currency: 'AUD' }).id;
});

describe('upsertImportConfig', () => {
  it('refuses a csv-dialect row with no dialect, naming the field', () => {
    expect(() => upsertImportConfig(db, { accountId, sourceKind: 'csv-dialect' })).toThrow(
      ImportConfigInvalidError
    );
    let caught: unknown;
    try {
      upsertImportConfig(db, { accountId, sourceKind: 'csv-dialect', dialectId: '' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ImportConfigInvalidError);
    expect((caught as ImportConfigInvalidError).missingField).toBe('dialectId');
    expect(getImportConfig(db, accountId)).toBeUndefined();
  });

  it('refuses a pdf-statement row with no parser', () => {
    expect(() => upsertImportConfig(db, { accountId, sourceKind: 'pdf-statement' })).toThrow(
      /parserId/
    );
  });

  it('refuses an api row with no provider', () => {
    expect(() =>
      upsertImportConfig(db, { accountId, sourceKind: 'api', secretRef: 'UP_API_TOKEN' })
    ).toThrow(/provider/);
  });

  it('stores an api row with its mapping and secret name, never a token', () => {
    const row = upsertImportConfig(db, {
      accountId,
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-123',
      secretRef: 'UP_API_TOKEN',
      expectedCadenceDays: 1,
    });
    expect(row).toMatchObject({
      accountId,
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-123',
      secretRef: 'UP_API_TOKEN',
      expectedCadenceDays: 1,
      dialectId: null,
      parserId: null,
    });
    expect(Object.keys(row)).not.toContain('token');
  });

  it('replaces every field on a second upsert rather than patching', () => {
    upsertImportConfig(db, {
      accountId,
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-123',
      secretRef: 'UP_API_TOKEN',
    });
    const replaced = upsertImportConfig(db, {
      accountId,
      sourceKind: 'csv-dialect',
      dialectId: 'ANZ',
    });
    expect(replaced).toMatchObject({
      sourceKind: 'csv-dialect',
      dialectId: 'ANZ',
      provider: null,
      externalAccountRef: null,
      secretRef: null,
    });
    expect(getImportConfig(db, accountId)).toEqual(replaced);
  });

  it('keeps created_at and moves updated_at on replace', () => {
    const first = upsertImportConfig(db, {
      accountId,
      sourceKind: 'csv-dialect',
      dialectId: 'Amex',
    });
    const second = upsertImportConfig(db, {
      accountId,
      sourceKind: 'csv-dialect',
      dialectId: 'ANZ',
    });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt >= first.updatedAt).toBe(true);
  });

  it('refuses a config for an account that does not exist', () => {
    expect(() =>
      upsertImportConfig(db, { accountId: 'nope', sourceKind: 'csv-dialect', dialectId: 'Amex' })
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('getImportConfig and deleteImportConfig', () => {
  it('is undefined for an account fed by hand', () => {
    expect(getImportConfig(db, accountId)).toBeUndefined();
  });

  it('deleteImportConfig returns false when there was nothing, true when it removed one', () => {
    expect(deleteImportConfig(db, accountId)).toBe(false);
    upsertImportConfig(db, { accountId, sourceKind: 'csv-dialect', dialectId: 'Amex' });
    expect(deleteImportConfig(db, accountId)).toBe(true);
    expect(getImportConfig(db, accountId)).toBeUndefined();
  });

  it('cascades away with its account', () => {
    upsertImportConfig(db, { accountId, sourceKind: 'csv-dialect', dialectId: 'Amex' });
    db.delete(accounts).where(eq(accounts.id, accountId)).run();
    expect(getImportConfig(db, accountId)).toBeUndefined();
  });
});
