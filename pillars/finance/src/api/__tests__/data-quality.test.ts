/**
 * Integration tests for `GET /data-quality/nudges` (POPS-2881, ADR-051).
 *
 * The rule under test lives at the route tier because it composes two
 * services — `listAccounts` and `checkpointDelta` — in a way no single
 * service test would catch a regression in: an account whose LATEST
 * checkpoint is consistent must produce no nudge even when an OLDER
 * checkpoint of its own disagreed, and an archived account must produce none
 * even with a currently-flagged latest checkpoint.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-data-quality-test-'));
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

async function anAccount(name = 'Everyday', kind = 'checking') {
  const created = await client().accounts.create({ name, kind, currency: 'AUD' });
  return created.data.id;
}

describe('GET /data-quality/nudges', () => {
  it('is empty with no accounts at all', async () => {
    expect((await client().dataQuality.nudges()).data).toEqual([]);
  });

  it('is empty for an account with no checkpoints, or one whose latest agrees', async () => {
    await anAccount('No checkpoints');
    const consistent = await anAccount('Consistent');
    await client().checkpoints.create(consistent, { balanceCents: 100_000, asOf: '2026-01-31' });

    expect((await client().dataQuality.nudges()).data).toEqual([]);
  });

  it('flags an account whose latest checkpoint disagrees with the ledger', async () => {
    const id = await anAccount('Amex Platinum', 'credit-card');
    await client().checkpoints.create(id, { balanceCents: -213_755, asOf: '2026-01-31' });
    // No transactions explain a $25 drop, so this one disagrees.
    const flagged = await client().checkpoints.create(id, {
      balanceCents: -216_255,
      asOf: '2026-02-28',
    });

    const { data } = await client().dataQuality.nudges();

    expect(data).toEqual([
      {
        kind: 'checkpoint-inconsistency',
        accountId: id,
        accountName: 'Amex Platinum',
        checkpointId: flagged.data.id,
        asOf: '2026-02-28',
        deltaCents: -2_500,
        currency: 'AUD',
        href: `/accounts/${id}/checkpoints`,
      },
    ]);
  });

  it('produces exactly one nudge per account — an old flagged checkpoint superseded by a consistent newer one is not one', async () => {
    const flaggedThenFixed = await anAccount('Re-anchored');
    await client().checkpoints.create(flaggedThenFixed, {
      balanceCents: 100_000,
      asOf: '2026-01-31',
    });
    // Disagrees with the checkpoint before it...
    await client().checkpoints.create(flaggedThenFixed, {
      balanceCents: 97_500,
      asOf: '2026-02-28',
    });
    // ...but this one re-anchors: it is now the latest, and it agrees (no
    // transactions between the two, so the ledger predicts no change).
    await client().checkpoints.create(flaggedThenFixed, {
      balanceCents: 97_500,
      asOf: '2026-03-31',
    });

    const stillFlagged = await anAccount('Genuinely inconsistent');
    await client().checkpoints.create(stillFlagged, { balanceCents: 50_000, asOf: '2026-01-31' });
    const flagged = await client().checkpoints.create(stillFlagged, {
      balanceCents: 40_000,
      asOf: '2026-02-28',
    });

    const { data } = await client().dataQuality.nudges();

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ accountId: stillFlagged, checkpointId: flagged.data.id });
  });

  it('excludes an archived account even with a currently-flagged latest checkpoint', async () => {
    const id = await anAccount('Soon archived');
    await client().checkpoints.create(id, { balanceCents: 100_000, asOf: '2026-01-31' });
    await client().checkpoints.create(id, { balanceCents: 97_500, asOf: '2026-02-28' });
    expect((await client().dataQuality.nudges()).data).toHaveLength(1);

    await client().accounts.delete(id);

    expect((await client().dataQuality.nudges()).data).toEqual([]);
  });

  it('orders by largest |deltaCents| first, so the panel can truncate', async () => {
    const small = await anAccount('Small delta');
    await client().checkpoints.create(small, { balanceCents: 10_000, asOf: '2026-01-31' });
    await client().checkpoints.create(small, { balanceCents: 10_100, asOf: '2026-02-28' });

    const large = await anAccount('Large delta', 'credit-card');
    await client().checkpoints.create(large, { balanceCents: -50_000, asOf: '2026-01-31' });
    await client().checkpoints.create(large, { balanceCents: -60_000, asOf: '2026-02-28' });

    const { data } = await client().dataQuality.nudges();

    expect(data.map((n) => n.accountId)).toEqual([large, small]);
    expect(
      data.map((n) => (n.kind === 'checkpoint-inconsistency' ? Math.abs(n.deltaCents) : n.kind))
    ).toEqual([10_000, 100]);
  });
});
