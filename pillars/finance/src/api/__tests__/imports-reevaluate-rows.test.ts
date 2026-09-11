/**
 * Integration tests for `POST /imports/reevaluate-pending-rows`, the
 * re-evaluation a live draft uses: the rows travel in the body because a live
 * draft has no process session to load them from. Runs against the real
 * Express app with the contacts pillar faked, and the AI categorizer pinned off
 * so an unmatched row stays `uncertain`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactionCorrectionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { clearProgress } from '../modules/imports/index.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

import type { ContactsClient } from '../contacts/client.js';

type Bucket = 'matched' | 'uncertain' | 'failed' | 'skipped';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-reevaluate-rows-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  clearProgress(financeDb.db);
});

afterEach(() => {
  clearProgress(financeDb.db);
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(contacts: ContactsClient = makeContactsFake()) {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts,
    })
  );
}

function row(checksum: string, description: string, status: Bucket = 'uncertain') {
  return {
    date: '2026-09-10',
    description,
    amount: -12.5,
    dialectAccountLabel: 'Up',
    rawRow: '{}',
    checksum,
    entity: { matchType: 'none' },
    status,
  };
}

function rows(prefix: string, count: number, status: Bucket) {
  return Array.from({ length: count }, (_, i) =>
    row(`${prefix}-${i}`, `ROW ${prefix} ${i}`, status)
  );
}

function result(buckets: Partial<Record<Bucket, ReturnType<typeof row>[]>>) {
  return {
    matched: buckets.matched ?? [],
    uncertain: buckets.uncertain ?? [],
    failed: buckets.failed ?? [],
    skipped: buckets.skipped ?? [],
  };
}

const acmeRule = {
  changeSet: {
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: 'ACME SUPPLIES',
          matchType: 'contains',
          entityId: 'acme-id',
          entityName: 'Acme',
          tags: [],
          confidence: 0.95,
        },
      },
    ],
  },
};

const acmeContacts = () => makeContactsFake({ seed: [{ id: 'acme-id', name: 'Acme' }] });

/** Every row of every table, so "writes nothing" covers tables this test does not know about. */
function databaseSnapshot(): Record<string, unknown[]> {
  const tables = financeDb.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, financeDb.raw.prepare(`SELECT * FROM "${name}"`).all()])
  );
}

const checksums = (list: { checksum: string }[]) => list.map((t) => t.checksum);

describe('imports.reevaluateRowsWithPendingRules', () => {
  it('re-buckets a row that a pending ChangeSet now matches, from the rows in the body', async () => {
    const c = client(acmeContacts());

    const res = await c.imports.reevaluateRowsWithPendingRules({
      result: result({ uncertain: [row('acme-1', 'ACME SUPPLIES 1234')] }),
      pendingChangeSets: [acmeRule],
    });

    expect(checksums(res.result.matched)).toEqual(['acme-1']);
    expect(res.result.uncertain).toEqual([]);
    expect(res.result.matched[0]?.entity).toMatchObject({
      entityId: 'acme-id',
      entityName: 'Acme',
    });
  });

  it('returns how many rows the re-evaluation changed, not how many it was sent', async () => {
    const c = client(acmeContacts());

    const res = await c.imports.reevaluateRowsWithPendingRules({
      result: result({
        uncertain: [row('acme-1', 'ACME SUPPLIES 1'), row('other-1', 'SOMEWHERE ELSE')],
        failed: [row('acme-2', 'ACME SUPPLIES 2', 'failed')],
        skipped: [row('skip-1', 'ACME SUPPLIES DUPLICATE', 'skipped')],
      }),
      pendingChangeSets: [acmeRule],
    });

    expect(res.affectedCount).toBe(2);
    expect(checksums(res.result.matched).toSorted()).toEqual(['acme-1', 'acme-2']);
    expect(checksums(res.result.uncertain)).toEqual(['other-1']);
    expect(checksums(res.result.skipped)).toEqual(['skip-1']);
  });

  it('carries the draft warnings through, so applying the result does not drop them', async () => {
    const c = client(acmeContacts());
    const warnings = [
      { type: 'AI_CATEGORIZATION_UNAVAILABLE', message: 'AI off', affectedCount: 1 },
    ];

    const res = await c.imports.reevaluateRowsWithPendingRules({
      result: { ...result({ uncertain: [row('acme-1', 'ACME SUPPLIES 1')] }), warnings },
      pendingChangeSets: [acmeRule],
    });

    expect(res.result.warnings).toEqual(warnings);
  });

  it('leaves every row where it was when the ChangeSet matches none of them', async () => {
    const c = client(acmeContacts());
    const sent = result({
      matched: [row('m-1', 'ALREADY MATCHED', 'matched')],
      uncertain: [row('u-1', 'NOTHING LIKE IT')],
    });

    const res = await c.imports.reevaluateRowsWithPendingRules({
      result: sent,
      pendingChangeSets: [acmeRule],
    });

    expect(res.affectedCount).toBe(0);
    expect(checksums(res.result.matched)).toEqual(['m-1']);
    expect(checksums(res.result.uncertain)).toEqual(['u-1']);
  });

  it('writes nothing: a saved rule matches the row, but its usage stays untouched (preview run)', async () => {
    const c = client(acmeContacts());
    const rule = transactionCorrectionsService.createOrUpdateTransactionCorrection(financeDb.db, {
      descriptionPattern: 'ACME SUPPLIES',
      matchType: 'contains',
      entityId: 'acme-id',
      entityName: 'Acme',
    });
    const before = databaseSnapshot();

    const res = await c.imports.reevaluateRowsWithPendingRules({
      result: result({ uncertain: [row('acme-1', 'ACME SUPPLIES 1234')] }),
      pendingChangeSets: [],
    });

    expect(res.affectedCount).toBeGreaterThanOrEqual(1);
    expect(databaseSnapshot()).toEqual(before);
    const after = transactionCorrectionsService.getTransactionCorrection(financeDb.db, rule.id);
    expect(after.timesApplied).toBe(0);
    expect(after.lastUsedAt).toBeNull();
  });

  it('rejects a body carrying both the session form and the rows form', async () => {
    const c = client();

    await expect(
      c.imports.reevaluateRowsWithPendingRules({
        sessionId: '00000000-0000-0000-0000-000000000000',
        result: result({ uncertain: [row('u-1', 'ANY')] }),
        pendingChangeSets: [],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a body carrying neither form, on either route', async () => {
    const c = client();

    await expect(
      c.imports.reevaluateRowsWithPendingRules({ pendingChangeSets: [] })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      c.imports.reevaluateWithPendingRules({ pendingChangeSets: [] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('does not accept the rows form on the session route', async () => {
    const c = client();

    await expect(
      c.imports.reevaluateWithPendingRules({
        result: result({ uncertain: [row('u-1', 'ANY')] }),
        pendingChangeSets: [],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts exactly the row cap, counted across every bucket', async () => {
    const c = client();

    const res = await c.imports.reevaluateRowsWithPendingRules({
      result: result({ uncertain: rows('u', 1, 'uncertain'), skipped: rows('s', 1999, 'skipped') }),
      pendingChangeSets: [],
    });

    expect(res.result.skipped).toHaveLength(1999);
  });

  it('rejects one row over the cap, even when no single bucket is over it', async () => {
    const c = client();

    await expect(
      c.imports.reevaluateRowsWithPendingRules({
        result: result({
          uncertain: rows('u', 1, 'uncertain'),
          skipped: rows('s', 2000, 'skipped'),
        }),
        pendingChangeSets: [],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts exactly the row cap, spread across matched and failed too', async () => {
    const c = client();

    const res = await c.imports.reevaluateRowsWithPendingRules({
      result: result({
        matched: rows('m', 500, 'matched'),
        uncertain: rows('u', 500, 'uncertain'),
        failed: rows('f', 500, 'failed'),
        skipped: rows('s', 500, 'skipped'),
      }),
      pendingChangeSets: [],
    });

    expect(res.result.matched).toHaveLength(500);
    expect(res.result.failed).toHaveLength(500);
  });

  it('rejects one row over the cap when matched and failed are what push it over', async () => {
    const c = client();

    await expect(
      c.imports.reevaluateRowsWithPendingRules({
        result: result({
          matched: rows('m', 500, 'matched'),
          uncertain: rows('u', 500, 'uncertain'),
          failed: rows('f', 500, 'failed'),
          skipped: rows('s', 501, 'skipped'),
        }),
        pendingChangeSets: [],
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
