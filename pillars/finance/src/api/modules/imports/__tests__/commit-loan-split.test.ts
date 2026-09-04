/**
 * End-to-end cover for the loan-repayment interest/principal split at import
 * (POPS-2830) — from a commit payload through to the two stored rows, and the
 * re-import-safety checksum that keeps a second run from duplicating them.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { transactions } from '../../../../db/schema.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { findExistingChecksums } from '../../../../db/services/imports.js';
import { writeLoanTerms } from '../../../../db/services/loan-terms.js';
import { createTransaction } from '../../../../db/services/transactions.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient } from '../../../contacts/client.js';
import { commitImport } from '../commit.js';
import { processImportCore } from '../process-service.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { CommitPayload, ParsedTransaction } from '../types.js';

function noContacts() {
  return createContactsClient(() => stubHandle({ list: vi.fn(async () => page([], false)) }));
}

/**
 * A loan account with $100,000 owed at 6% p.a. as of the repayment date, so
 * the interest is a clean, hand-computable `100_000_00 × 6 / 100 / 12 = 500_00`
 * cents ($500.00).
 */
function seedLoanAccount(db: FinanceDb): void {
  const account = createAccount(db, { name: 'Home Loan', kind: 'loan', currency: 'AUD' });
  writeLoanTerms(db, account.id, {
    originalPrincipalCents: 10_000_000,
    annualRatePct: 6,
    termMonths: 360,
    monthlyRepaymentCents: 150_000,
    startedOn: '2024-01-01',
    termsEffectiveFrom: '2024-01-01',
  });
  createTransaction(db, {
    description: 'Initial drawdown',
    account: 'Home Loan',
    amountCents: -10_000_000,
    date: '2024-01-01',
    type: 'loan',
  });
}

const REPAYMENT_CHECKSUM = 'chk-loan-repayment-1';

function repaymentPayload(): CommitPayload {
  return {
    entities: [],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions: [
      {
        date: '2026-07-01',
        description: 'Loan repayment',
        amount: 1500,
        account: 'Home Loan',
        rawRow: '{}',
        checksum: REPAYMENT_CHECKSUM,
        transactionType: 'transfer',
      },
    ],
  };
}

function repaymentRows(db: FinanceDb) {
  return db.select().from(transactions).where(eq(transactions.date, '2026-07-01')).all();
}

describe('loan repayment split at import', () => {
  it('splits a repayment into a fee/fee:interest row and a transfer row summing to the statement amount', async () => {
    const { db } = freshMigratedFinanceDb();
    seedLoanAccount(db);

    const result = await commitImport(db, noContacts(), repaymentPayload());

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(2);

    const rows = repaymentRows(db);
    expect(rows).toHaveLength(2);

    const fee = rows.find((row) => row.type === 'fee');
    const transfer = rows.find((row) => row.type === 'transfer');
    expect(fee).toMatchObject({ amountCents: 50_000, tags: JSON.stringify(['fee:interest']) });
    expect(transfer).toMatchObject({ amountCents: 100_000 });
    expect((fee?.amountCents ?? 0) + (transfer?.amountCents ?? 0)).toBe(150_000);
  });

  it('keeps the original checksum on the principal/transfer leg and derives a distinct one for the interest leg', async () => {
    const { db } = freshMigratedFinanceDb();
    seedLoanAccount(db);

    await commitImport(db, noContacts(), repaymentPayload());

    const rows = repaymentRows(db);
    const checksums = rows.map((row) => row.checksum).toSorted();
    expect(checksums).toEqual(
      [REPAYMENT_CHECKSUM, `${REPAYMENT_CHECKSUM}:loan-interest-split`].toSorted()
    );
  });

  it('re-import safety: the original checksum reads as already-committed, so a re-run would skip it before reaching commit again', async () => {
    const { db } = freshMigratedFinanceDb();
    seedLoanAccount(db);

    await commitImport(db, noContacts(), repaymentPayload());

    const existing = findExistingChecksums(db, [REPAYMENT_CHECKSUM]);
    expect(existing.has(REPAYMENT_CHECKSUM)).toBe(true);
  });

  it('re-running the same import: processImportCore buckets the statement line as a duplicate, never reaching commit again', async () => {
    const { db } = freshMigratedFinanceDb();
    seedLoanAccount(db);
    await commitImport(db, noContacts(), repaymentPayload());
    expect(repaymentRows(db)).toHaveLength(2);

    const rerun: ParsedTransaction = {
      date: '2026-07-01',
      description: 'Loan repayment',
      amount: 1500,
      account: 'Home Loan',
      rawRow: '{}',
      checksum: REPAYMENT_CHECKSUM,
    };
    const { output, processedNewCount } = await processImportCore({
      db,
      contacts: makeContactsFake(),
      transactions: [rerun],
      importBatchId: 'batch-2',
    });

    expect(processedNewCount).toBe(0);
    expect(output.skipped).toHaveLength(1);
    expect(output.skipped[0]?.skipReason).toContain('Duplicate');
    expect(output.matched).toHaveLength(0);
    // Nothing further was staged for commit, so the two rows on file are
    // still the only ones — a re-run genuinely does not duplicate the split.
    expect(repaymentRows(db)).toHaveLength(2);
  });

  it('is left unsplit when the loan account has no terms configured yet', async () => {
    const { db } = freshMigratedFinanceDb();
    createAccount(db, { name: 'Home Loan', kind: 'loan', currency: 'AUD' });

    const result = await commitImport(db, noContacts(), repaymentPayload());

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(1);
    const rows = repaymentRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'transfer', amountCents: 150_000 });
  });

  it('refuses to commit a positive amount typed loan against a loan account (reserved for the drawdown)', async () => {
    const { db } = freshMigratedFinanceDb();
    seedLoanAccount(db);

    const payload = repaymentPayload();
    const [txn] = payload.transactions;
    if (!txn) throw new Error('fixture payload lost its transaction');
    txn.transactionType = 'loan';

    const result = await commitImport(db, noContacts(), payload);

    expect(result.transactionsImported).toBe(0);
    expect(result.failedDetails).toHaveLength(1);
    expect(repaymentRows(db)).toHaveLength(0);
  });

  it('computes each leg from the running balance in date order even when the batch arrives newest-first', async () => {
    const { db } = freshMigratedFinanceDb();
    seedLoanAccount(db);

    // A bank statement exported newest-first: the later-dated repayment
    // appears BEFORE the earlier-dated one in `transactions`. Without a
    // chronological sort ahead of the insert loop, `getAccountBalanceBefore`
    // would compute the 2026-08-01 leg's balance before the 2026-07-01
    // repayment has been inserted, missing it entirely.
    const payload: CommitPayload = {
      entities: [],
      changeSets: [],
      tagRuleChangeSets: [],
      transactions: [
        {
          date: '2026-08-01',
          description: 'Loan repayment (later)',
          amount: 1500,
          account: 'Home Loan',
          rawRow: '{}',
          checksum: 'chk-loan-repayment-later',
          transactionType: 'transfer',
        },
        {
          date: '2026-07-01',
          description: 'Loan repayment (earlier)',
          amount: 1500,
          account: 'Home Loan',
          rawRow: '{}',
          checksum: 'chk-loan-repayment-earlier',
          transactionType: 'transfer',
        },
      ],
    };

    const result = await commitImport(db, noContacts(), payload);

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(4);

    const earlierFee = db
      .select()
      .from(transactions)
      .where(eq(transactions.checksum, 'chk-loan-repayment-earlier:loan-interest-split'))
      .get();
    const laterFee = db
      .select()
      .from(transactions)
      .where(eq(transactions.checksum, 'chk-loan-repayment-later:loan-interest-split'))
      .get();

    // Earlier leg: balance before 2026-07-01 is only the $100,000 drawdown —
    // unaffected by ordering either way, since the later-dated repayment can
    // never fall before it chronologically.
    expect(earlierFee?.amountCents).toBe(50_000);

    // Later leg: balance before 2026-08-01 must include the earlier
    // repayment's full $1,500 (both legs reduce the loan balance, not just the
    // $1,000 principal) — $100,000 - $1,500 = $98,500 owing, so interest is
    // 6% × $98,500 / 12 = $492.50 — NOT the buggy $500.00 that results from
    // missing the earlier-dated row entirely.
    expect(laterFee?.amountCents).toBe(49_250);
  });

  it('resolves the loan account by accountId, not by the dialect account label (POPS-2830/POPS-2852)', async () => {
    const { db } = freshMigratedFinanceDb();
    seedLoanAccount(db);
    const homeLoan = db
      .select()
      .from(transactions)
      .where(eq(transactions.description, 'Initial drawdown'))
      .get();
    if (!homeLoan) throw new Error('seedLoanAccount fixture lost its drawdown row');
    const homeLoanAccountId = homeLoan.accountId;

    // A second, unrelated account that happens to be named after the bank's
    // dialect label the statement carries in `account` — exactly the
    // situation `resolveAccountIdByName` would resolve to instead of the
    // wizard-picked `accountId`, corrupting the split against the wrong
    // account's balance/rate.
    createAccount(db, { name: 'ANZ Home Loan', kind: 'checking', currency: 'AUD' });

    const payload: CommitPayload = {
      entities: [],
      changeSets: [],
      tagRuleChangeSets: [],
      transactions: [
        {
          date: '2026-07-01',
          description: 'Loan repayment',
          amount: 1500,
          account: 'ANZ Home Loan',
          accountId: homeLoanAccountId,
          rawRow: '{}',
          checksum: REPAYMENT_CHECKSUM,
          transactionType: 'transfer',
        },
      ],
    };

    const result = await commitImport(db, noContacts(), payload);

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(2);

    const rows = repaymentRows(db);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.accountId === homeLoanAccountId)).toBe(true);

    const fee = rows.find((row) => row.type === 'fee');
    const transfer = rows.find((row) => row.type === 'transfer');
    expect(fee).toMatchObject({ amountCents: 50_000, tags: JSON.stringify(['fee:interest']) });
    expect(transfer).toMatchObject({ amountCents: 100_000 });
  });

  it('leaves a negative-amount loan-typed drawdown against a loan account untouched (not a repayment)', async () => {
    const { db } = freshMigratedFinanceDb();
    seedLoanAccount(db);

    const payload = repaymentPayload();
    const [txn] = payload.transactions;
    if (!txn) throw new Error('fixture payload lost its transaction');
    txn.amount = -50_000;
    txn.transactionType = 'loan';
    txn.checksum = 'chk-drawdown-2';

    const result = await commitImport(db, noContacts(), payload);

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(1);
    const rows = repaymentRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'loan', amountCents: -5_000_000 });
  });
});
