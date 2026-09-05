/**
 * Import-time checkpoint minting (POPS-2882): the sign rule in isolation, and
 * the commit pipeline end to end — one checkpoint from a statement's closing
 * balance, a re-import that must not double it, and a mismatch that must warn
 * without failing the commit.
 */
import { describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { accountCheckpoints } from '../../../../db/schema.js';
import { insertCheckpoint } from '../../../../db/services/account-checkpoints.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient } from '../../../contacts/client.js';
import { signStatementBalance } from '../commit-checkpoint.js';
import { commitImport } from '../commit.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { CommitPayload } from '../types.js';

function noContacts() {
  return createContactsClient(() => stubHandle({ list: vi.fn(async () => page([], false)) }));
}

describe('signStatementBalance', () => {
  it("signs a liability's unmarked printed balance negative (money owed)", () => {
    expect(signStatementBalance(64_080, undefined, 'liability')).toBe(-64_080);
  });

  it("signs a liability's CR-marked balance positive (in credit)", () => {
    expect(signStatementBalance(64_080, 'CR', 'liability')).toBe(64_080);
  });

  it("signs an asset's unmarked printed balance positive (money held)", () => {
    expect(signStatementBalance(64_080, undefined, 'asset')).toBe(64_080);
  });

  it("signs an asset's DR-marked balance negative (overdrawn)", () => {
    expect(signStatementBalance(64_080, 'DR', 'asset')).toBe(-64_080);
  });
});

function creditCardPayload(accountId: string): CommitPayload {
  return {
    entities: [],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions: [
      {
        date: '2026-07-05',
        description: 'Coffee shop',
        amount: -4.5,
        account: 'Test Credit Card',
        accountId,
        rawRow: '{}',
        checksum: 'chk-coffee',
        transactionType: 'purchase',
        balanceCents: 45_000,
      },
      {
        date: '2026-07-10',
        description: 'Groceries',
        amount: -20,
        account: 'Test Credit Card',
        accountId,
        rawRow: '{}',
        checksum: 'chk-groceries',
        transactionType: 'purchase',
        balanceCents: 65_000,
      },
    ],
  };
}

function seedAccount(db: FinanceDb): string {
  const account = createAccount(db, {
    name: 'Test Credit Card',
    kind: 'credit-card',
    currency: 'AUD',
  });
  return account.id;
}

describe('mintImportCheckpointsPhase, via commitImport', () => {
  it('mints one checkpoint from the last row in file order, ledger-signed negative for a credit card', async () => {
    const { db } = freshMigratedFinanceDb();
    const accountId = seedAccount(db);

    const result = await commitImport(db, noContacts(), creditCardPayload(accountId));

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(2);
    expect(result.warnings).toBeUndefined();

    const checkpoints = db.select().from(accountCheckpoints).all();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({
      accountId,
      asOf: '2026-07-10',
      balanceCents: -65_000,
      source: 'import',
    });
    expect(result.checkpoint).toEqual({ id: checkpoints[0]?.id, deltaCents: 0 });
  });

  it('does not double the checkpoint on a re-import of the same statement', async () => {
    const { db } = freshMigratedFinanceDb();
    const accountId = seedAccount(db);
    const payload = creditCardPayload(accountId);

    const first = await commitImport(db, noContacts(), payload);
    expect(first.checkpoint).toBeDefined();

    const second = await commitImport(db, noContacts(), creditCardPayload(accountId));

    expect(second.failedDetails).toEqual([]);
    expect(second.checkpoint).toBeUndefined();
    expect(db.select().from(accountCheckpoints).all()).toHaveLength(1);
  });

  it('warns with the expected/actual/delta when the ledger disagrees, and still commits', async () => {
    const { db } = freshMigratedFinanceDb();
    const accountId = seedAccount(db);
    insertCheckpoint(db, {
      accountId,
      balanceCents: -1_000,
      asOf: '2026-06-01',
      source: 'manual',
    });

    const payload: CommitPayload = {
      entities: [],
      changeSets: [],
      tagRuleChangeSets: [],
      transactions: [
        {
          date: '2026-07-05',
          description: 'Coffee shop',
          amount: -5,
          account: 'Test Credit Card',
          accountId,
          rawRow: '{}',
          checksum: 'chk-short-import',
          transactionType: 'purchase',
          // The statement says $40 owed; the one row imported only accounts
          // for $5 more debt on top of the $10 the prior checkpoint recorded
          // — a $25 gap the ledger is missing rows for.
          balanceCents: 4_000,
        },
      ],
    };

    const result = await commitImport(db, noContacts(), payload);

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(1);
    expect(result.checkpoint?.deltaCents).toBe(-2_500);
    expect(result.warnings).toEqual([
      {
        type: 'CHECKPOINT_MISMATCH',
        message: "Ledger disagrees with Test Credit Card's statement closing balance",
        affectedCount: 1,
        details: 'expected -1500c, statement says -4000c (Δ -2500c)',
      },
    ]);
  });
});
