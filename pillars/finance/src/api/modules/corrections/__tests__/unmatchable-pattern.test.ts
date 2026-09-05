/**
 * A correction pattern that normalises to the empty string must be refused at
 * every write boundary (POPS-3001).
 *
 * `normalizeDescription` strips digits and collapses whitespace, so `'1234'`
 * and `'   '` normalise to `''`, and `patternMatchesDescription` answers
 * `false` unconditionally for a zero-length pattern — the row is stored,
 * active, listed like any working rule, and structurally unable to fire.
 * `transaction_tag_rules` has thrown `UnmatchablePatternError` for this since
 * POPS-2942; the corrections tables never got the mirror.
 *
 * The guard stops at an empty normalisation: a `regex` pattern of `'1234'` is
 * a valid expression matching those digits literally and stays writable, as
 * does a pattern matching nothing in today's ledger.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { UnmatchablePatternError } from '../../../../db/errors.js';
import { transactionCorrections } from '../../../../db/schema/corrections.js';
import {
  createOrUpdateTransactionCorrection,
  updateTransactionCorrection,
} from '../../../../db/services/transaction-corrections.js';
import { applyChangeSet, dropUnusableAddOps } from '../service.js';

import type { ChangeSet } from '../../../../contract/rest-corrections.js';
import type { FinanceDb } from '../../../../db/services/internal.js';

function addChangeSet(pattern: string, matchType: 'exact' | 'contains' | 'regex'): ChangeSet {
  return {
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: pattern,
          matchType,
          entityId: 'ent-acme',
          entityName: 'Acme',
          tags: [],
        },
      },
    ],
  };
}

describe('correction writes refuse a pattern that normalises to nothing', () => {
  let db: FinanceDb;

  beforeEach(() => {
    db = freshMigratedFinanceDb().db;
  });

  it('refuses an all-digit contains pattern in a ChangeSet and stores nothing', () => {
    expect(() => applyChangeSet(db, addChangeSet('1234', 'contains'))).toThrow(
      /can never match a description/
    );
    expect(db.select().from(transactionCorrections).all()).toHaveLength(0);
  });

  it('refuses a whitespace-only exact pattern in a ChangeSet', () => {
    expect(() => applyChangeSet(db, addChangeSet('   ', 'exact'))).toThrow(
      /can never match a description/
    );
    expect(db.select().from(transactionCorrections).all()).toHaveLength(0);
  });

  it('still accepts a regex pattern of "1234" — it matches those digits literally', () => {
    applyChangeSet(db, addChangeSet('1234', 'regex'));

    const [row] = db.select().from(transactionCorrections).all();
    expect(row?.descriptionPattern).toBe('1234');
    expect(row?.isActive).toBe(true);
  });

  it('refuses an all-digit pattern on the direct create path', () => {
    expect(() =>
      createOrUpdateTransactionCorrection(db, {
        descriptionPattern: '42',
        matchType: 'contains',
        entityId: 'ent-acme',
        entityName: 'Acme',
      })
    ).toThrow(UnmatchablePatternError);
  });

  it('refuses a PATCH that introduces an empty pattern and leaves the row untouched', () => {
    const row = createOrUpdateTransactionCorrection(db, {
      descriptionPattern: 'ACME CORP',
      matchType: 'contains',
      entityId: 'ent-acme',
      entityName: 'Acme',
    });

    expect(() => updateTransactionCorrection(db, row.id, { descriptionPattern: '999' })).toThrow(
      UnmatchablePatternError
    );

    const [after] = db.select().from(transactionCorrections).all();
    expect(after?.descriptionPattern).toBe('ACME CORP');
  });

  it('drops rather than explodes on the import-commit path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const changeSet: ChangeSet = {
      ops: [...addChangeSet('1234', 'contains').ops, ...addChangeSet('ACME CORP', 'contains').ops],
    };

    const survived = dropUnusableAddOps(changeSet);
    applyChangeSet(db, survived);
    warn.mockRestore();

    expect(survived.ops).toHaveLength(1);
    const [row] = db.select().from(transactionCorrections).all();
    expect(row?.descriptionPattern).toBe('ACME CORP');
  });
});
