/**
 * Invariant tests for the loan offset-link service against an in-memory
 * SQLite carrying the migrated finance schema (POPS-2829).
 *
 * The two things worth breaking here: unlinking must keep the row (a past
 * offset arrangement stays readable), and the loan side must stay kind-gated
 * while the offset side stays open to any existing account.
 */
import { describe, expect, it } from 'vitest';

import {
  AccountKindMismatchError,
  AccountNotFoundError,
  LoanOffsetLinkConflictError,
  LoanOffsetLinkNotFoundError,
} from '../errors.js';
import { createAccount } from '../services/accounts.js';
import {
  linkOffsetAccount,
  listOffsetLinks,
  unlinkOffsetAccount,
} from '../services/loan-offset-links.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

function makeLoanAccount(db: FinanceDb, name = 'Home Loan') {
  return createAccount(db, { name, kind: 'loan', currency: 'AUD' });
}

describe('linkOffsetAccount', () => {
  it('links an offset account and returns an active link', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db);
    const offset = createAccount(db, { name: 'Offset', kind: 'checking', currency: 'AUD' });

    const link = linkOffsetAccount(db, loan.id, {
      offsetAccountId: offset.id,
      linkedFrom: '2024-03-01',
    });

    expect(link.loanAccountId).toBe(loan.id);
    expect(link.offsetAccountId).toBe(offset.id);
    expect(link.unlinkedAt).toBeNull();
  });

  it('accepts any existing account as the offset side, not just checking/savings', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db);
    const cash = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });

    const link = linkOffsetAccount(db, loan.id, {
      offsetAccountId: cash.id,
      linkedFrom: '2024-03-01',
    });

    expect(link.offsetAccountId).toBe(cash.id);
  });

  it('supports several offset accounts on one loan', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db);
    const first = createAccount(db, { name: 'Offset A', kind: 'checking', currency: 'AUD' });
    const second = createAccount(db, { name: 'Offset B', kind: 'savings', currency: 'AUD' });

    linkOffsetAccount(db, loan.id, { offsetAccountId: first.id, linkedFrom: '2024-03-01' });
    linkOffsetAccount(db, loan.id, { offsetAccountId: second.id, linkedFrom: '2024-06-01' });

    expect(listOffsetLinks(db, loan.id, true)).toHaveLength(2);
  });

  it('refuses a second active link for the same pair', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db);
    const offset = createAccount(db, { name: 'Offset', kind: 'checking', currency: 'AUD' });
    linkOffsetAccount(db, loan.id, { offsetAccountId: offset.id, linkedFrom: '2024-03-01' });

    expect(() =>
      linkOffsetAccount(db, loan.id, { offsetAccountId: offset.id, linkedFrom: '2024-06-01' })
    ).toThrow(LoanOffsetLinkConflictError);
  });

  it('throws AccountKindMismatchError when the loan side is not a loan account', () => {
    const db = freshDb();
    const checking = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' });
    const offset = createAccount(db, { name: 'Offset', kind: 'savings', currency: 'AUD' });

    expect(() =>
      linkOffsetAccount(db, checking.id, { offsetAccountId: offset.id, linkedFrom: '2024-03-01' })
    ).toThrow(AccountKindMismatchError);
  });

  it('throws AccountNotFoundError for an offset account that does not exist', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db);

    expect(() =>
      linkOffsetAccount(db, loan.id, { offsetAccountId: 'nope', linkedFrom: '2024-03-01' })
    ).toThrow(AccountNotFoundError);
  });
});

describe('unlinkOffsetAccount', () => {
  it('stamps unlinkedAt and keeps the row readable as history', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db);
    const offset = createAccount(db, { name: 'Offset', kind: 'checking', currency: 'AUD' });
    const link = linkOffsetAccount(db, loan.id, {
      offsetAccountId: offset.id,
      linkedFrom: '2024-03-01',
    });

    const unlinked = unlinkOffsetAccount(db, loan.id, link.id);

    expect(unlinked.unlinkedAt).toEqual(expect.any(String));
    expect(listOffsetLinks(db, loan.id)).toHaveLength(1);
    expect(listOffsetLinks(db, loan.id, true)).toHaveLength(0);
  });

  it('is idempotent — a second unlink does not move the original timestamp', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db);
    const offset = createAccount(db, { name: 'Offset', kind: 'checking', currency: 'AUD' });
    const link = linkOffsetAccount(db, loan.id, {
      offsetAccountId: offset.id,
      linkedFrom: '2024-03-01',
    });

    const first = unlinkOffsetAccount(db, loan.id, link.id);
    const second = unlinkOffsetAccount(db, loan.id, link.id);

    expect(second.unlinkedAt).toBe(first.unlinkedAt);
  });

  it('allows re-linking the same pair once the previous link is closed', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db);
    const offset = createAccount(db, { name: 'Offset', kind: 'checking', currency: 'AUD' });
    const link = linkOffsetAccount(db, loan.id, {
      offsetAccountId: offset.id,
      linkedFrom: '2024-03-01',
    });
    unlinkOffsetAccount(db, loan.id, link.id);

    const relinked = linkOffsetAccount(db, loan.id, {
      offsetAccountId: offset.id,
      linkedFrom: '2025-02-01',
    });

    expect(relinked.id).not.toBe(link.id);
    expect(listOffsetLinks(db, loan.id)).toHaveLength(2);
    expect(listOffsetLinks(db, loan.id, true)).toHaveLength(1);
  });

  it('throws LoanOffsetLinkNotFoundError for a link belonging to another loan', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db, 'Home Loan');
    const otherLoan = makeLoanAccount(db, 'Car Loan');
    const offset = createAccount(db, { name: 'Offset', kind: 'checking', currency: 'AUD' });
    const link = linkOffsetAccount(db, loan.id, {
      offsetAccountId: offset.id,
      linkedFrom: '2024-03-01',
    });

    expect(() => unlinkOffsetAccount(db, otherLoan.id, link.id)).toThrow(
      LoanOffsetLinkNotFoundError
    );
  });
});

describe('listOffsetLinks', () => {
  it('throws AccountKindMismatchError against a non-loan account', () => {
    const db = freshDb();
    const savings = createAccount(db, { name: 'Rainy Day', kind: 'savings', currency: 'AUD' });
    expect(() => listOffsetLinks(db, savings.id)).toThrow(AccountKindMismatchError);
  });

  it('does not leak another loan’s links', () => {
    const db = freshDb();
    const loan = makeLoanAccount(db, 'Home Loan');
    const otherLoan = makeLoanAccount(db, 'Car Loan');
    const offset = createAccount(db, { name: 'Offset', kind: 'checking', currency: 'AUD' });
    linkOffsetAccount(db, loan.id, { offsetAccountId: offset.id, linkedFrom: '2024-03-01' });

    expect(listOffsetLinks(db, otherLoan.id)).toHaveLength(0);
  });
});
