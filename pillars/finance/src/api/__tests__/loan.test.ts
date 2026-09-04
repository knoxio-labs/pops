/**
 * Integration tests for the `accounts/:id/loan-*` REST surface (POPS-2829):
 * terms CRUD, rate history with its latest-only rule, offset links, and the
 * 422 kind-mismatch mapping that gates all of it to `loan`-kind accounts.
 *
 * The money assertions are the reason these exist at the route tier rather
 * than only at the service tier: the dollars↔cents conversion only happens on
 * the wire edge, so a service-tier test cannot see it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-loan-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

const TERMS_BODY = {
  originalPrincipal: 650_000,
  annualRatePct: 5.49,
  termMonths: 360,
  monthlyRepayment: 3689,
  startedOn: '2024-03-01',
  termsEffectiveFrom: '2024-03-01',
};

async function createLoanAccount(name = 'Home Loan') {
  const created = await client().accounts.create({ name, kind: 'loan', currency: 'AUD' });
  return created.data.id;
}

async function createAccountOfKind(name: string, kind: string) {
  const created = await client().accounts.create({ name, kind, currency: 'AUD' });
  return created.data.id;
}

describe('loan accounts — the kind is no longer reserved', () => {
  it('creates a loan account through the API', async () => {
    const created = await client().accounts.create({
      name: 'Home Loan',
      kind: 'loan',
      currency: 'AUD',
    });
    expect(created.data.kind).toBe('loan');
  });

  it('still 422s a kind that IS reserved', async () => {
    await expect(
      client().accounts.create({ name: 'Someday', kind: 'crypto', currency: 'AUD' })
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('loan terms — happy paths', () => {
  it('writes and reads back terms with money in decimal dollars', async () => {
    const accountId = await createLoanAccount();

    const written = await client().loan.writeTerms(accountId, TERMS_BODY);
    expect(written.data).toMatchObject({
      accountId,
      originalPrincipal: 650_000,
      annualRatePct: 5.49,
      termMonths: 360,
      monthlyRepayment: 3689,
      startedOn: '2024-03-01',
      termsEffectiveFrom: '2024-03-01',
      source: 'manual',
    });
    expect(written.message).toBe('Loan terms saved');

    const read = await client().loan.getTerms(accountId);
    expect(read.data.originalPrincipal).toBe(650_000);
    expect(read.data.updatedAt).toEqual(expect.any(String));
  });

  it('round-trips a repayment with cents through the dollars↔cents boundary', async () => {
    const accountId = await createLoanAccount();

    const written = await client().loan.writeTerms(accountId, {
      ...TERMS_BODY,
      monthlyRepayment: 3689.42,
    });

    expect(written.data.monthlyRepayment).toBe(3689.42);
  });

  it('seeds a rate history row from the terms write', async () => {
    const accountId = await createLoanAccount();
    await client().loan.writeTerms(accountId, TERMS_BODY);

    const history = await client().loan.listRateHistory(accountId);
    expect(history.data).toHaveLength(1);
    expect(history.data[0]).toMatchObject({
      loanAccountId: accountId,
      annualRatePct: 5.49,
      effectiveFrom: '2024-03-01',
      source: 'manual',
    });
  });

  it('records a later rate and moves the terms’ current rate with it', async () => {
    const accountId = await createLoanAccount();
    await client().loan.writeTerms(accountId, TERMS_BODY);

    const recorded = await client().loan.recordRate(accountId, {
      annualRatePct: 6.25,
      effectiveFrom: '2025-01-01',
      source: 'imported',
    });
    expect(recorded.data.source).toBe('imported');

    const terms = await client().loan.getTerms(accountId);
    expect(terms.data.annualRatePct).toBe(6.25);
    const history = await client().loan.listRateHistory(accountId);
    expect(history.data.map((row) => row.effectiveFrom)).toEqual(['2025-01-01', '2024-03-01']);
  });

  it('defaults a recorded rate’s source to manual', async () => {
    const accountId = await createLoanAccount();
    await client().loan.writeTerms(accountId, TERMS_BODY);

    const recorded = await client().loan.recordRate(accountId, {
      annualRatePct: 6.25,
      effectiveFrom: '2025-01-01',
    });

    expect(recorded.data.source).toBe('manual');
  });
});

describe('loan terms — error mapping', () => {
  it('422s a terms write against a non-loan account', async () => {
    const accountId = await createAccountOfKind('Wallet', 'cash');

    await expect(client().loan.writeTerms(accountId, TERMS_BODY)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('422s a terms read against a non-loan account', async () => {
    const accountId = await createAccountOfKind('Everyday', 'checking');

    await expect(client().loan.getTerms(accountId)).rejects.toMatchObject({ status: 422 });
  });

  it('422s a rate write against a non-loan account', async () => {
    const accountId = await createAccountOfKind('Rainy Day', 'savings');

    await expect(
      client().loan.recordRate(accountId, { annualRatePct: 6, effectiveFrom: '2025-01-01' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('422s a backdated rate', async () => {
    const accountId = await createLoanAccount();
    await client().loan.writeTerms(accountId, TERMS_BODY);

    await expect(
      client().loan.recordRate(accountId, { annualRatePct: 4, effectiveFrom: '2023-01-01' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('404s a terms read for a loan account with no terms written yet', async () => {
    const accountId = await createLoanAccount();
    await expect(client().loan.getTerms(accountId)).rejects.toMatchObject({ status: 404 });
  });

  it('404s a terms write against a missing account', async () => {
    await expect(client().loan.writeTerms('missing-id', TERMS_BODY)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('400s a terms write with a non-ISO startedOn', async () => {
    const accountId = await createLoanAccount();

    await expect(
      client().loan.writeTerms(accountId, { ...TERMS_BODY, startedOn: '01/03/2024' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s a terms write with a negative principal', async () => {
    const accountId = await createLoanAccount();

    await expect(
      client().loan.writeTerms(accountId, { ...TERMS_BODY, originalPrincipal: -1 })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('loan offset links', () => {
  it('links an offset account, lists it, and unlinks without losing it', async () => {
    const loanId = await createLoanAccount();
    const offsetId = await createAccountOfKind('Offset', 'checking');

    const linked = await client().loan.linkOffsetAccount(loanId, {
      offsetAccountId: offsetId,
      linkedFrom: '2024-03-01',
    });
    expect(linked.data).toMatchObject({
      loanAccountId: loanId,
      offsetAccountId: offsetId,
      unlinkedAt: null,
    });

    const unlinked = await client().loan.unlinkOffsetAccount(loanId, linked.data.id);
    expect(unlinked.data.unlinkedAt).toEqual(expect.any(String));

    const all = await client().loan.listOffsetLinks(loanId);
    expect(all.data).toHaveLength(1);
    const active = await client().loan.listOffsetLinks(loanId, { active: 'true' });
    expect(active.data).toHaveLength(0);
  });

  it('accepts a link to an account of any kind', async () => {
    const loanId = await createLoanAccount();
    const cashId = await createAccountOfKind('Wallet', 'cash');

    const linked = await client().loan.linkOffsetAccount(loanId, {
      offsetAccountId: cashId,
      linkedFrom: '2024-03-01',
    });

    expect(linked.data.offsetAccountId).toBe(cashId);
  });

  it('409s a second active link for the same pair', async () => {
    const loanId = await createLoanAccount();
    const offsetId = await createAccountOfKind('Offset', 'checking');
    await client().loan.linkOffsetAccount(loanId, {
      offsetAccountId: offsetId,
      linkedFrom: '2024-03-01',
    });

    await expect(
      client().loan.linkOffsetAccount(loanId, {
        offsetAccountId: offsetId,
        linkedFrom: '2024-06-01',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('422s a link whose loan side is not a loan account', async () => {
    const checkingId = await createAccountOfKind('Everyday', 'checking');
    const offsetId = await createAccountOfKind('Offset', 'savings');

    await expect(
      client().loan.linkOffsetAccount(checkingId, {
        offsetAccountId: offsetId,
        linkedFrom: '2024-03-01',
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('404s a link naming an offset account that does not exist', async () => {
    const loanId = await createLoanAccount();

    await expect(
      client().loan.linkOffsetAccount(loanId, {
        offsetAccountId: 'does-not-exist',
        linkedFrom: '2024-03-01',
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('422s a link where the offset account is the loan account itself', async () => {
    const loanId = await createLoanAccount();

    await expect(
      client().loan.linkOffsetAccount(loanId, {
        offsetAccountId: loanId,
        linkedFrom: '2024-03-01',
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('404s an unlink of a link id belonging to a different loan', async () => {
    const loanId = await createLoanAccount('Home Loan');
    const otherLoanId = await createLoanAccount('Car Loan');
    const offsetId = await createAccountOfKind('Offset', 'checking');
    const linked = await client().loan.linkOffsetAccount(loanId, {
      offsetAccountId: offsetId,
      linkedFrom: '2024-03-01',
    });

    await expect(
      client().loan.unlinkOffsetAccount(otherLoanId, linked.data.id)
    ).rejects.toMatchObject({ status: 404 });
  });
});
