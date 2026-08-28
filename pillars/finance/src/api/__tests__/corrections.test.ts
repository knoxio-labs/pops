/**
 * Integration tests for the `corrections.*` REST surface — the deterministic
 * CRUD over the finance-owned `transaction_corrections` table.
 *
 * Covers the happy paths (list + filters + pagination, get, createOrUpdate
 * with reinforcement, update, delete, adjustConfidence incl. the
 * confidence-floor GC, findMatch classification, previewMatches against the
 * transactions table), the 404s on unknown ids, and request-validation 400s.
 *
 * Transactions for the previewMatches test are seeded through the finance-db
 * service directly (no REST create-transaction is needed for setup), so the
 * test exercises the real matcher against real rows.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, transactionsService, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-corrections-test-'));
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

describe('corrections — createOrUpdate, get & list', () => {
  it('creates a correction, then reinforces it on a second create', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'WOOLWORTHS METRO',
      matchType: 'contains',
      entityName: 'Woolworths',
      transactionType: 'purchase',
      tags: ['groceries'],
    });
    expect(created.message).toBe('Correction saved');
    expect(created.data).toMatchObject({
      descriptionPattern: 'WOOLWORTHS METRO',
      matchType: 'contains',
      entityName: 'Woolworths',
      tags: ['groceries'],
      isActive: true,
      confidence: 0.7,
      timesApplied: 0,
    });

    // Same (normalized pattern, matchType) → reinforced, not duplicated.
    const reinforced = await client().corrections.createOrUpdate({
      descriptionPattern: 'WOOLWORTHS METRO 1234',
      matchType: 'contains',
      tags: ['groceries'],
    });
    expect(reinforced.data.id).toBe(created.data.id);
    expect(reinforced.data.confidence).toBeCloseTo(0.8, 5);
    expect(reinforced.data.timesApplied).toBe(1);

    const list = await client().corrections.list();
    expect(list.data).toHaveLength(1);
    expect(list.pagination).toMatchObject({ total: 1, hasMore: false });
  });

  it('gets a correction by id', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'COLES',
      matchType: 'exact',
    });
    const fetched = await client().corrections.get(created.data.id);
    expect(fetched.data.id).toBe(created.data.id);
    expect(fetched.data.matchType).toBe('exact');
  });

  it('filters by matchType / minConfidence and paginates', async () => {
    await client().corrections.createOrUpdate({ descriptionPattern: 'A', matchType: 'exact' });
    await client().corrections.createOrUpdate({ descriptionPattern: 'B', matchType: 'contains' });
    await client().corrections.createOrUpdate({ descriptionPattern: 'C', matchType: 'contains' });

    const onlyContains = await client().corrections.list({ matchType: 'contains' });
    expect(onlyContains.pagination.total).toBe(2);
    expect(onlyContains.data.every((c) => c.matchType === 'contains')).toBe(true);

    // All three seed at confidence 0.7, so a 0.9 floor excludes everything.
    const highConfidence = await client().corrections.list({ minConfidence: 0.9 });
    expect(highConfidence.pagination.total).toBe(0);

    const firstPage = await client().corrections.list({ limit: 2, offset: 0 });
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });
  });
});

describe('corrections — update, delete & adjustConfidence', () => {
  it('updates fields on an existing correction', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'NETFLIX',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    const updated = await client().corrections.update(created.data.id, {
      tags: ['subscriptions'],
      priority: 3,
      isActive: false,
    });
    expect(updated.message).toBe('Correction updated');
    expect(updated.data).toMatchObject({
      tags: ['subscriptions'],
      priority: 3,
      isActive: false,
    });
  });

  it('deletes a correction', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'SPOTIFY',
      matchType: 'contains',
    });
    const deleted = await client().corrections.delete(created.data.id);
    expect(deleted.message).toBe('Correction deleted');
    await expect(client().corrections.get(created.data.id)).rejects.toMatchObject({ status: 404 });
  });

  it('adjusts confidence and GCs the row when it drops below 0.3', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'AMAZON',
      matchType: 'contains',
    });

    const bumped = await client().corrections.adjustConfidence(created.data.id, 0.2);
    expect(bumped.message).toBe('Confidence adjusted');
    expect((await client().corrections.get(created.data.id)).data.confidence).toBeCloseTo(0.9, 5);

    // 0.9 - 0.7 = 0.2 < 0.3 floor → row is deleted by the GC path.
    await client().corrections.adjustConfidence(created.data.id, -0.7);
    await expect(client().corrections.get(created.data.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('corrections — 404s on unknown ids', () => {
  it('404s get / update / delete / adjustConfidence for a missing id', async () => {
    await expect(client().corrections.get('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().corrections.update('nope', { tags: ['x'] })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().corrections.delete('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().corrections.adjustConfidence('nope', 0.1)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('corrections — findMatch', () => {
  it('classifies a confident match, an uncertain match, and a miss', async () => {
    // Confidence starts at 0.7 (uncertain); bumped to 0.95 → matched.
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
    });

    const uncertain = await client().corrections.findMatch({
      description: 'WOOLWORTHS METRO SYDNEY',
      minConfidence: 0.3,
    });
    expect(uncertain.status).toBe('uncertain');
    expect(uncertain.data?.id).toBe(created.data.id);

    await client().corrections.adjustConfidence(created.data.id, 0.25); // 0.7 → 0.95
    const matched = await client().corrections.findMatch({
      description: 'WOOLWORTHS METRO SYDNEY',
    });
    expect(matched.status).toBe('matched');

    const miss = await client().corrections.findMatch({ description: 'TOTALLY UNRELATED' });
    expect(miss).toEqual({ data: null, status: null });
  });
});

describe('corrections — previewMatches', () => {
  it('returns the transactions a candidate (pattern, matchType) rule would match', async () => {
    const db = financeDb.db;
    transactionsService.createTransaction(db, {
      description: 'WOOLWORTHS 1234 SYDNEY',
      account: 'checking',
      amountCents: -5000,
      date: '2026-01-01',
    });
    transactionsService.createTransaction(db, {
      description: 'WOOLWORTHS METRO',
      account: 'checking',
      amountCents: -1200,
      date: '2026-01-02',
    });
    transactionsService.createTransaction(db, {
      description: 'COLES EXPRESS',
      account: 'checking',
      amountCents: -800,
      date: '2026-01-03',
    });

    const preview = await client().corrections.previewMatches({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
    });
    expect(preview.data.scanned).toBe(3);
    expect(preview.data.total).toBe(2);
    expect(preview.data.truncated).toBe(false);
    expect(preview.data.matches.map((m) => m.description).toSorted()).toEqual([
      'WOOLWORTHS 1234 SYDNEY',
      'WOOLWORTHS METRO',
    ]);

    const truncatedPreview = await client().corrections.previewMatches({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
      limit: 1,
    });
    expect(truncatedPreview.data.total).toBe(2);
    expect(truncatedPreview.data.matches).toHaveLength(1);
    expect(truncatedPreview.data.truncated).toBe(true);
  });
});

describe('corrections — ruleMatchPreview', () => {
  it('lists the full DB match set with a true total and pages with limit/offset', async () => {
    const db = financeDb.db;
    for (let i = 1; i <= 3; i += 1) {
      transactionsService.createTransaction(db, {
        description: `WOOLWORTHS ${i}00 SYDNEY`,
        account: 'checking',
        amountCents: -i * 100,
        date: `2026-01-0${i}`,
        checksum: `chk-${i}`,
      });
    }
    transactionsService.createTransaction(db, {
      description: 'COLES EXPRESS',
      account: 'checking',
      amountCents: -800,
      date: '2026-01-09',
    });

    const firstPage = await client().corrections.ruleMatchPreview({
      pattern: 'WOOLWORTHS SYDNEY',
      matchType: 'contains',
      limit: 2,
    });
    expect(firstPage.data.totalCount).toBe(3);
    expect(firstPage.data.matches).toHaveLength(2);
    // Newest date first.
    expect(firstPage.data.matches.map((m) => m.date)).toEqual(['2026-01-03', '2026-01-02']);
    expect(firstPage.data.matches[0]).toMatchObject({
      description: 'WOOLWORTHS 300 SYDNEY',
      checksum: 'chk-3',
      entityId: null,
      entityName: null,
    });

    const secondPage = await client().corrections.ruleMatchPreview({
      pattern: 'WOOLWORTHS SYDNEY',
      matchType: 'contains',
      limit: 2,
      offset: 2,
    });
    expect(secondPage.data.totalCount).toBe(3);
    expect(secondPage.data.matches.map((m) => m.date)).toEqual(['2026-01-01']);
  });

  it('400s a ruleMatchPreview with an invalid matchType', async () => {
    await expect(
      client().corrections.ruleMatchPreview({ pattern: 'X', matchType: 'fuzzy' })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('corrections — request validation', () => {
  it('400s a createOrUpdate with an empty descriptionPattern', async () => {
    await expect(
      client().corrections.createOrUpdate({ descriptionPattern: '', matchType: 'exact' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s a createOrUpdate carrying tags but no entityId/transactionType (CF061/#3650)', async () => {
    await expect(
      client().corrections.createOrUpdate({
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        tags: ['Groceries'],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s an update that would leave a correction tags-only (CF061/#3650)', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      tags: ['Groceries'],
    });

    await expect(
      client().corrections.update(created.data.id, { entityId: null })
    ).rejects.toMatchObject({ status: 400 });

    // Rejected — the row must be untouched.
    const unchanged = await client().corrections.get(created.data.id);
    expect(unchanged.data.entityId).toBe('ent-woolies');
  });

  it('400s an applyChangeSet add op carrying tags but no entityId/transactionType (CF061/#3650)', async () => {
    await expect(
      client().corrections.applyChangeSet({
        changeSet: {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'PAYID PAYMENT RECEIVED',
                matchType: 'contains',
                tags: ['Income'],
              },
            },
          ],
        },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rolls back the whole ChangeSet when a later add op is tags-only (CF061/#3650)', async () => {
    await expect(
      client().corrections.applyChangeSet({
        changeSet: {
          ops: [
            { op: 'add', data: { descriptionPattern: 'GOOD RULE', matchType: 'contains' } },
            {
              op: 'add',
              data: { descriptionPattern: 'BAD RULE', matchType: 'contains', tags: ['X'] },
            },
          ],
        },
      })
    ).rejects.toMatchObject({ status: 400 });

    const list = await client().corrections.list();
    expect(list.data.find((c) => c.descriptionPattern === 'GOOD RULE')).toBeUndefined();
  });

  it('400s an adjustConfidence with an out-of-range delta', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'DELTA',
      matchType: 'exact',
    });
    await expect(client().corrections.adjustConfidence(created.data.id, 5)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('400s a previewMatches with an invalid matchType', async () => {
    await expect(
      client().corrections.previewMatches({ descriptionPattern: 'X', matchType: 'fuzzy' })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('corrections — applyChangeSet', () => {
  it('applies add / edit / disable / remove ops atomically and returns the full rule set', async () => {
    // Seed two rules to edit/disable later.
    const seed = await client().corrections.applyChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'KEEP',
              matchType: 'contains',
              transactionType: 'purchase',
              tags: ['a'],
            },
          },
          { op: 'add', data: { descriptionPattern: 'DROP', matchType: 'exact' } },
        ],
      },
    });
    expect(seed.message).toBe('ChangeSet applied');
    expect(seed.data).toHaveLength(2);
    const keep = seed.data.find((c) => c.descriptionPattern === 'KEEP')!;
    const drop = seed.data.find((c) => c.descriptionPattern === 'DROP')!;

    const result = await client().corrections.applyChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'NEW', matchType: 'contains', confidence: 0.8 },
          },
          { op: 'edit', id: keep.id, data: { tags: ['a', 'b'], entityName: 'Acme' } },
          { op: 'remove', id: drop.id },
        ],
      },
    });

    const byPattern = new Map(result.data.map((c) => [c.descriptionPattern, c]));
    expect(byPattern.has('DROP')).toBe(false);
    expect(byPattern.get('KEEP')).toMatchObject({ tags: ['a', 'b'], entityName: 'Acme' });
    expect(byPattern.get('NEW')).toMatchObject({ matchType: 'contains', confidence: 0.8 });

    // The persisted state matches what apply returned.
    const list = await client().corrections.list();
    expect(list.data.map((c) => c.descriptionPattern).toSorted()).toEqual(['KEEP', 'NEW']);
  });

  it('disable flips isActive without deleting the row', async () => {
    const seed = await client().corrections.applyChangeSet({
      changeSet: { ops: [{ op: 'add', data: { descriptionPattern: 'OFF', matchType: 'exact' } }] },
    });
    const id = seed.data[0]!.id;
    await client().corrections.applyChangeSet({ changeSet: { ops: [{ op: 'disable', id }] } });
    expect((await client().corrections.get(id)).data.isActive).toBe(false);
  });

  it('rolls the whole ChangeSet back when an op targets an unknown id (404)', async () => {
    await expect(
      client().corrections.applyChangeSet({
        changeSet: {
          ops: [
            { op: 'add', data: { descriptionPattern: 'GHOST', matchType: 'exact' } },
            { op: 'edit', id: 'does-not-exist', data: { tags: ['x'] } },
          ],
        },
      })
    ).rejects.toMatchObject({ status: 404 });

    // The add must NOT have landed — the transaction rolled back.
    expect((await client().corrections.list()).pagination.total).toBe(0);
  });

  it('400s an empty ops array', async () => {
    await expect(
      client().corrections.applyChangeSet({ changeSet: { ops: [] } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('persists priority on add, and re-persists it on a later edit (#3613 — drag-to-reorder)', async () => {
    const seed = await client().corrections.applyChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'REORDER ME', matchType: 'contains', priority: 3 },
          },
        ],
      },
    });
    const created = seed.data[0]!;
    expect(created.priority).toBe(3);

    // Re-fetch to prove it round-trips through the DB, not just the apply response.
    expect((await client().corrections.get(created.id)).data.priority).toBe(3);

    // Drag-to-reorder: a later edit changes only priority.
    const reordered = await client().corrections.applyChangeSet({
      changeSet: { ops: [{ op: 'edit', id: created.id, data: { priority: 9 } }] },
    });
    expect(reordered.data.find((c) => c.id === created.id)?.priority).toBe(9);
    expect((await client().corrections.get(created.id)).data.priority).toBe(9);
  });

  it('upsert-keys a same-session duplicate add on (descriptionPattern, matchType) instead of forking a dead row (CF035/#3640)', async () => {
    const seeded = await client().corrections.applyChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'woolworths 1234',
              matchType: 'exact',
              entityName: 'First Pass',
              priority: 1,
            },
          },
          {
            op: 'add',
            data: {
              descriptionPattern: 'WOOLWORTHS 5678',
              matchType: 'exact',
              entityName: 'Second Pass',
              priority: 2,
            },
          },
        ],
      },
    });

    // Both `add` ops normalize to the same (descriptionPattern, matchType)
    // key — digits are stripped by normalizeDescription — so they must
    // collapse onto one row, last-write-wins, instead of forking a second
    // rule that would never fire because the matcher also normalizes.
    expect(seeded.data).toHaveLength(1);
    expect(seeded.data[0]).toMatchObject({
      descriptionPattern: 'WOOLWORTHS',
      entityName: 'Second Pass',
      priority: 2,
    });

    const list = await client().corrections.list();
    expect(list.pagination.total).toBe(1);
  });

  it('upsert-keys an add against a rule from an earlier, already-applied ChangeSet', async () => {
    await client().corrections.applyChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'ACME CORP', matchType: 'contains', priority: 0 },
          },
        ],
      },
    });

    const retried = await client().corrections.applyChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'ACME CORP',
              matchType: 'contains',
              entityName: 'Acme Corp',
              priority: 5,
            },
          },
        ],
      },
    });

    expect(retried.data).toHaveLength(1);
    expect(retried.data[0]).toMatchObject({ entityName: 'Acme Corp', priority: 5 });
    expect((await client().corrections.list()).pagination.total).toBe(1);
  });
});

describe('corrections — previewChangeSet', () => {
  it('diffs before/after match outcomes and rolls them up into a summary', async () => {
    // Persisted baseline rule R1 (confidence 0.95 → matches at the 0.7 floor).
    await client().corrections.applyChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'FOO', matchType: 'contains', confidence: 0.95 },
          },
        ],
      },
    });

    const preview = await client().corrections.previewChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'BAR', matchType: 'contains', confidence: 0.95 },
          },
        ],
      },
      transactions: [{ description: 'FOO PURCHASE' }, { description: 'BAR SHOP' }],
    });

    const foo = preview.diffs.find((d) => d.description === 'FOO PURCHASE')!;
    const bar = preview.diffs.find((d) => d.description === 'BAR SHOP')!;
    expect(foo.before.matched).toBe(true);
    expect(foo.changed).toBe(false); // R1 already matched FOO before and after
    expect(bar.before.matched).toBe(false);
    expect(bar.after.matched).toBe(true);
    expect(bar.changed).toBe(true);
    expect(preview.summary).toMatchObject({
      total: 2,
      newMatches: 1,
      removedMatches: 0,
      statusChanges: 0,
      netMatchedDelta: 1,
    });
  });

  it('folds pendingChangeSets into the baseline so `before` reflects un-persisted rules', async () => {
    // R1 persisted; the preview removes it, but a pending add re-matches BAR.
    const seed = await client().corrections.applyChangeSet({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'FOO', matchType: 'contains', confidence: 0.95 },
          },
        ],
      },
    });
    const r1 = seed.data[0]!.id;

    const preview = await client().corrections.previewChangeSet({
      changeSet: { ops: [{ op: 'remove', id: r1 }] },
      transactions: [{ description: 'FOO PURCHASE' }, { description: 'BAR SHOP' }],
      pendingChangeSets: [
        {
          changeSet: {
            ops: [
              {
                op: 'add',
                data: { descriptionPattern: 'BAR', matchType: 'contains', confidence: 0.95 },
              },
            ],
          },
        },
      ],
    });

    const foo = preview.diffs.find((d) => d.description === 'FOO PURCHASE')!;
    const bar = preview.diffs.find((d) => d.description === 'BAR SHOP')!;
    // baseline (with the pending add) matched both; removing R1 only drops FOO.
    expect(foo.before.matched).toBe(true);
    expect(foo.after.matched).toBe(false);
    expect(bar.before.matched).toBe(true);
    expect(bar.after.matched).toBe(true);
    expect(preview.summary).toMatchObject({
      removedMatches: 1,
      newMatches: 0,
      netMatchedDelta: -1,
    });
  });

  it('400s a preview with an empty transactions array', async () => {
    await expect(
      client().corrections.previewChangeSet({
        changeSet: { ops: [{ op: 'add', data: { descriptionPattern: 'X', matchType: 'exact' } }] },
        transactions: [],
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('corrections — listMerged', () => {
  it('folds pending ChangeSets in, including un-persisted temp: add rows', async () => {
    await client().corrections.createOrUpdate({
      descriptionPattern: 'PERSISTED',
      matchType: 'exact',
    });

    const merged = await client().corrections.listMerged({
      pendingChangeSets: [
        {
          changeSet: {
            ops: [{ op: 'add', data: { descriptionPattern: 'PENDING', matchType: 'contains' } }],
          },
        },
      ],
    });

    expect(merged.pagination.total).toBe(2);
    const patterns = merged.data.map((c) => c.descriptionPattern).toSorted();
    expect(patterns).toEqual(['PENDING', 'PERSISTED']);
    expect(merged.data.some((c) => c.id.startsWith('temp:'))).toBe(true);
  });

  it('assigns a distinct temp id to each pending add across separate ChangeSets', async () => {
    // Regression (#3596): the rule manager posts one single-`add` ChangeSet per
    // proposed rule. The fold applied each ChangeSet independently, so a counter
    // that restarted at `temp:1` per call made every pending row share one id —
    // the sidebar then keyed and selected them all as one.
    const merged = await client().corrections.listMerged({
      pendingChangeSets: [
        {
          changeSet: {
            ops: [{ op: 'add', data: { descriptionPattern: 'ALDI', matchType: 'exact' } }],
          },
        },
        {
          changeSet: {
            ops: [{ op: 'add', data: { descriptionPattern: 'KMART', matchType: 'exact' } }],
          },
        },
        {
          changeSet: {
            ops: [{ op: 'add', data: { descriptionPattern: 'IKEA', matchType: 'exact' } }],
          },
        },
      ],
    });

    const tempIds = merged.data.filter((c) => c.id.startsWith('temp:')).map((c) => c.id);
    expect(tempIds).toHaveLength(3);
    expect(new Set(tempIds).size).toBe(3);
  });

  it('reflects pending edit/disable ops over persisted rows', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'EDITME',
      matchType: 'exact',
      transactionType: 'purchase',
      tags: ['old'],
    });

    const merged = await client().corrections.listMerged({
      pendingChangeSets: [
        { changeSet: { ops: [{ op: 'edit', id: created.data.id, data: { tags: ['new'] } }] } },
      ],
    });
    expect(merged.data.find((c) => c.id === created.data.id)?.tags).toEqual(['new']);

    // The persisted row is untouched — the fold is in-memory only.
    expect((await client().corrections.get(created.data.id)).data.tags).toEqual(['old']);
  });

  it('paginates the merged set', async () => {
    for (const p of ['A', 'B', 'C']) {
      await client().corrections.createOrUpdate({ descriptionPattern: p, matchType: 'exact' });
    }
    const page = await client().corrections.listMerged({ limit: 2, offset: 0 });
    expect(page.data).toHaveLength(2);
    expect(page.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });
  });

  it('returns only persisted rows when no pending ChangeSets are supplied', async () => {
    await client().corrections.createOrUpdate({ descriptionPattern: 'SOLO', matchType: 'exact' });
    const merged = await client().corrections.listMerged();
    expect(merged.pagination.total).toBe(1);
    expect(merged.data[0]?.descriptionPattern).toBe('SOLO');
  });

  it('reflects a pending priority edit in the optimistic preview (#3613 — drag-to-reorder)', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'DRAGGABLE',
      matchType: 'exact',
    });

    const merged = await client().corrections.listMerged({
      pendingChangeSets: [
        { changeSet: { ops: [{ op: 'edit', id: created.data.id, data: { priority: 7 } }] } },
      ],
    });
    expect(merged.data.find((c) => c.id === created.data.id)?.priority).toBe(7);
  });
});

describe('corrections — applyExisting (retroactive apply, #3660)', () => {
  async function seedConfidentRule(): Promise<string> {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'BIG W',
      matchType: 'exact',
      entityId: 'ent-bigw',
      entityName: 'BIG W',
      tags: ['shopping'],
    });
    await client().corrections.update(created.data.id, { confidence: 0.95 });
    return created.data.id;
  }

  it('applies a confident rule to a matching non-manual transaction: entity + tags + provenance', async () => {
    const db = financeDb.db;
    const txn = transactionsService.createTransaction(db, {
      description: 'BIG W',
      account: 'amex',
      amountCents: -3000,
      date: '2026-01-01',
    });
    const ruleId = await seedConfidentRule();

    const result = await client().corrections.applyExisting(ruleId);
    expect(result.data).toMatchObject({
      dryRun: false,
      matched: 1,
      updated: 1,
      skippedManual: 0,
      skippedUncertain: 0,
    });

    const row = transactionsService.getTransaction(db, txn.id);
    expect(row.entityId).toBe('ent-bigw');
    expect(row.entityName).toBe('BIG W');
    expect(JSON.parse(row.tags)).toEqual(['shopping']);
    expect(row.matchType).toBe('learned');
    expect(row.matchRuleId).toBe(ruleId);
    expect(row.matchConfidence).toBeCloseTo(0.95, 5);
  });

  it('skips a transaction whose matchType is manual (CF017/#3623)', async () => {
    const db = financeDb.db;
    const txn = transactionsService.createTransaction(db, {
      description: 'BIG W',
      account: 'amex',
      amountCents: -3000,
      date: '2026-01-01',
      entityId: 'ent-user-picked',
    });
    transactionsService.updateTransaction(db, txn.id, { entityId: 'ent-user-picked' });
    const ruleId = await seedConfidentRule();

    const result = await client().corrections.applyExisting(ruleId);
    expect(result.data).toMatchObject({ matched: 1, updated: 0, skippedManual: 1 });

    const row = transactionsService.getTransaction(db, txn.id);
    expect(row.entityId).toBe('ent-user-picked');
    expect(row.matchType).toBe('manual');
  });

  it('skips an uncertain (sub-threshold) rule match, applying nothing', async () => {
    const db = financeDb.db;
    transactionsService.createTransaction(db, {
      description: 'BIG W',
      account: 'amex',
      amountCents: -3000,
      date: '2026-01-01',
    });
    // Default confidence from createOrUpdate is below the 0.9 matched threshold.
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'BIG W',
      matchType: 'exact',
      entityId: 'ent-bigw',
      entityName: 'BIG W',
      tags: ['shopping'],
    });

    const result = await client().corrections.applyExisting(created.data.id);
    expect(result.data).toMatchObject({ matched: 1, updated: 0, skippedUncertain: 1 });
  });

  it('dryRun computes the same match set without writing or bumping usage telemetry', async () => {
    const db = financeDb.db;
    const txn = transactionsService.createTransaction(db, {
      description: 'BIG W',
      account: 'amex',
      amountCents: -3000,
      date: '2026-01-01',
    });
    const ruleId = await seedConfidentRule();

    const preview = await client().corrections.applyExisting(ruleId, { dryRun: true });
    expect(preview.data).toMatchObject({ dryRun: true, matched: 1, updated: 1 });

    const row = transactionsService.getTransaction(db, txn.id);
    expect(row.entityId).toBeNull();
    expect(row.matchType).toBeNull();

    const rule = await client().corrections.get(ruleId);
    expect(rule.data.timesApplied).toBe(0);
  });

  it('a second real apply against the same rule is a no-op (idempotent)', async () => {
    const db = financeDb.db;
    transactionsService.createTransaction(db, {
      description: 'BIG W',
      account: 'amex',
      amountCents: -3000,
      date: '2026-01-01',
    });
    const ruleId = await seedConfidentRule();

    const first = await client().corrections.applyExisting(ruleId);
    expect(first.data.updated).toBe(1);

    const second = await client().corrections.applyExisting(ruleId);
    expect(second.data).toMatchObject({ matched: 1, updated: 0 });

    const rule = await client().corrections.get(ruleId);
    expect(rule.data.timesApplied).toBe(1);
  });

  it('404s applying an unknown rule id', async () => {
    await expect(client().corrections.applyExisting('nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('corrections — regex patterns (POPS-2600)', () => {
  const REGEX_PATTERN = String.raw`\d{4}-\d{2}`;

  async function createRegexCorrection() {
    return client().corrections.createOrUpdate({
      descriptionPattern: REGEX_PATTERN,
      matchType: 'regex',
      entityId: 'ent-regex',
      entityName: 'Regex Co',
    });
  }

  it('stores a regex pattern verbatim through a create round-trip', async () => {
    const created = await createRegexCorrection();
    expect(created.data.descriptionPattern).toBe(REGEX_PATTERN);

    const read = await client().corrections.get(created.data.id);
    expect(read.data.descriptionPattern).toBe(REGEX_PATTERN);
  });

  it('stores a regex pattern verbatim through an update round-trip', async () => {
    const created = await createRegexCorrection();
    const nextPattern = String.raw`^ACME\s+STORE\.\d+$`;

    const updated = await client().corrections.update(created.data.id, {
      descriptionPattern: nextPattern,
    });
    expect(updated.data.descriptionPattern).toBe(nextPattern);

    const read = await client().corrections.get(created.data.id);
    expect(read.data.descriptionPattern).toBe(nextPattern);
  });

  it('still normalizes a contains pattern on write', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'Acme Store 42',
      matchType: 'contains',
      entityId: 'ent-acme',
      entityName: 'Acme',
    });
    expect(created.data.descriptionPattern).toBe('ACME STORE');
  });

  it('400s a createOrUpdate whose regex pattern does not compile', async () => {
    await expect(
      client().corrections.createOrUpdate({
        descriptionPattern: '[unclosed',
        matchType: 'regex',
        entityId: 'ent-bad',
      })
    ).rejects.toMatchObject({ status: 400 });

    const listed = await client().corrections.list({});
    expect(listed.data).toHaveLength(0);
  });

  it('400s an update that would set an uncompilable regex pattern', async () => {
    const created = await createRegexCorrection();

    await expect(
      client().corrections.update(created.data.id, { descriptionPattern: '(unbalanced' })
    ).rejects.toMatchObject({ status: 400 });

    const unchanged = await client().corrections.get(created.data.id);
    expect(unchanged.data.descriptionPattern).toBe(REGEX_PATTERN);
  });

  it('400s a matchType flip to regex when the stored pattern would not compile', async () => {
    // `normalizeDescription` uppercases and strips digits but leaves parens
    // intact, so an `exact` pattern can be a broken regex.
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'T(arget',
      matchType: 'exact',
      entityId: 'ent-target',
      entityName: 'Target',
    });
    expect(created.data.descriptionPattern).toBe('T(ARGET');

    await expect(
      client().corrections.update(created.data.id, { matchType: 'regex' })
    ).rejects.toMatchObject({ status: 400 });

    const unchanged = await client().corrections.get(created.data.id);
    expect(unchanged.data.matchType).toBe('exact');
    expect(unchanged.data.descriptionPattern).toBe('T(ARGET');
  });

  it('allows a matchType flip to regex when the stored pattern does compile', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'Woolworths',
      matchType: 'exact',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
    });

    const updated = await client().corrections.update(created.data.id, { matchType: 'regex' });
    expect(updated.data.matchType).toBe('regex');
    expect(updated.data.descriptionPattern).toBe('WOOLWORTHS');
  });

  it('still allows editing a legacy row whose regex was already uncompilable', async () => {
    // Seeded past the boundary the way a pre-POPS-2600 row would be.
    financeDb.raw
      .prepare(
        `INSERT INTO transaction_corrections (
          id, description_pattern, match_type, entity_id, is_active, confidence, priority
        ) VALUES ('legacy-bad', '[unclosed', 'regex', 'ent-legacy', 1, 0.9, 0)`
      )
      .run();

    const disabled = await client().corrections.update('legacy-bad', { isActive: false });
    expect(disabled.data.isActive).toBe(false);
  });

  it('400s an applyChangeSet add op whose regex pattern does not compile', async () => {
    await expect(
      client().corrections.applyChangeSet({
        changeSet: {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'a{2,1}(',
                matchType: 'regex',
                entityId: 'ent-bad',
              },
            },
          ],
        },
      })
    ).rejects.toMatchObject({ status: 400 });

    const listed = await client().corrections.list({});
    expect(listed.data).toHaveLength(0);
  });
});
