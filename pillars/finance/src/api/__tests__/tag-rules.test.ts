/**
 * Integration tests for the `tagRules.*` REST surface: vocabulary listing,
 * deterministic ChangeSet propose/preview (impact diffs, new-tag flagging,
 * userTags short-circuit, match-type semantics), apply (rule persistence +
 * vocabulary upsert, 404 on editing an unknown rule), reject (message-only
 * response, persisted feedback), the standalone list/get/update/
 * disable/delete Tag Rules browser surface (incl. a read-never-mutates
 * telemetry check), and matchPreview (full-DB usage-history preview).
 *
 * The finance baseline migration seeds a default tag vocabulary, so tests
 * use a clearly-unseeded tag (`CUSTOM_TAG`) for new-tag assertions rather
 * than assuming an empty vocabulary.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  tagRuleRejectionsService,
  transactions,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-tagrules-test-'));
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

const CUSTOM_TAG = 'midnight-snacks';

const addOp = {
  source: 'test',
  ops: [
    {
      op: 'add',
      data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: [CUSTOM_TAG] },
    },
  ],
};

describe('tagRules — vocabulary & apply', () => {
  it('upserts accepted new tags on apply, ignoring blanks', async () => {
    const initial = (await client().tagRules.vocabulary()).tags;
    expect(initial).not.toContain(CUSTOM_TAG); // unseeded
    expect(initial.length).toBeGreaterThan(0); // baseline seed present

    const applied = await client().tagRules.apply({
      changeSet: addOp,
      acceptedNewTags: [CUSTOM_TAG, '  '],
    });
    expect(applied.rules).toHaveLength(1);
    expect(applied.rules[0]).toMatchObject({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
      tags: [CUSTOM_TAG],
      isActive: true,
      confidence: 0.95,
    });

    const after = (await client().tagRules.vocabulary()).tags;
    expect(after).toContain(CUSTOM_TAG);
    expect(after).not.toContain(''); // blank-only entry ignored
    expect(after.length).toBe(initial.length + 1);
  });

  it('edits and removes a persisted rule via ChangeSet ops', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const id = created.rules[0]?.id ?? '';

    const edited = await client().tagRules.apply({
      changeSet: { ops: [{ op: 'edit', id, data: { tags: [CUSTOM_TAG, 'late-night'] } }] },
      acceptedNewTags: [],
    });
    expect(edited.rules[0]?.tags).toEqual([CUSTOM_TAG, 'late-night']);

    const removed = await client().tagRules.apply({
      changeSet: { ops: [{ op: 'remove', id }] },
      acceptedNewTags: [],
    });
    expect(removed.rules).toHaveLength(0);
  });

  it('404s an edit op targeting an unknown rule id', async () => {
    await expect(
      client().tagRules.apply({
        changeSet: { ops: [{ op: 'edit', id: 'nope', data: { tags: ['x'] } }] },
        acceptedNewTags: [],
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('tagRules — propose & preview', () => {
  const txs = [
    { transactionId: 't1', description: 'WOOLWORTHS 1234 SYDNEY', entityId: null },
    { transactionId: 't2', description: 'COLES 5678', entityId: null },
    { transactionId: 't3', description: 'WOOLWORTHS METRO', entityId: null, userTags: ['mine'] },
  ];

  it('proposes an add ChangeSet with a deterministic impact preview', async () => {
    const proposal = await client().tagRules.propose({
      signal: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: [CUSTOM_TAG] },
      transactions: txs,
    });

    expect(proposal.changeSet.ops).toHaveLength(1);
    expect(proposal.rationale).toContain('WOOLWORTHS');
    // t1 matches; t2 doesn't; t3 is skipped (has userTags).
    expect(proposal.preview.counts.affected).toBe(1);
    expect(proposal.preview.affected[0]?.transactionId).toBe('t1');
    // CUSTOM_TAG is not in the seeded vocabulary → flagged new.
    expect(proposal.preview.affected[0]?.after.suggestedTags[0]).toMatchObject({
      tag: CUSTOM_TAG,
      isNew: true,
    });
    expect(proposal.preview.counts.newTagProposals).toBe(1);
  });

  it('preview honours match-type semantics (exact vs contains)', async () => {
    const exact = await client().tagRules.preview({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'WOOLWORTHS', matchType: 'exact', tags: ['g'] },
          },
        ],
      },
      transactions: txs,
    });
    // No description equals 'WOOLWORTHS' exactly → nothing affected.
    expect(exact.counts.affected).toBe(0);

    const contains = await client().tagRules.preview({
      changeSet: {
        ops: [
          { op: 'add', data: { descriptionPattern: 'COLES', matchType: 'contains', tags: ['g'] } },
        ],
      },
      transactions: txs,
    });
    expect(contains.affected.map((a) => a.transactionId)).toEqual(['t2']);
  });

  it('marks a tag already in the vocabulary as not new', async () => {
    await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [CUSTOM_TAG] });

    const preview = await client().tagRules.preview({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'COLES', matchType: 'contains', tags: [CUSTOM_TAG] },
          },
        ],
      },
      transactions: [{ transactionId: 't2', description: 'COLES 5678', entityId: null }],
    });
    expect(preview.affected[0]?.after.suggestedTags[0]).toMatchObject({
      tag: CUSTOM_TAG,
      isNew: false,
    });
    expect(preview.counts.newTagProposals).toBe(0);
    expect(preview.newTags).toEqual([]);
  });

  it('reports zero impact for a ChangeSet that is already persisted', async () => {
    await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [CUSTOM_TAG] });

    const preview = await client().tagRules.preview({
      changeSet: addOp,
      transactions: [{ transactionId: 't1', description: 'WOOLWORTHS 1234', entityId: null }],
    });
    expect(preview.counts.affected).toBe(0);
  });
});

describe('tagRules — list / get / update / disable / delete', () => {
  it('lists rules with pagination and filters, sorted by confidence desc', async () => {
    await client().tagRules.apply({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: ['groceries'] },
          },
        ],
      },
      acceptedNewTags: [],
    });
    await client().tagRules.apply({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'NETFLIX',
              matchType: 'exact',
              tags: ['subscriptions'],
              confidence: 0.4,
            },
          },
        ],
      },
      acceptedNewTags: [],
    });

    const all = await client().tagRules.list();
    expect(all.data).toHaveLength(2);
    expect(all.pagination).toMatchObject({ total: 2, limit: 50, offset: 0, hasMore: false });
    expect(all.data[0]?.descriptionPattern).toBe('WOOLWORTHS');

    const exactOnly = await client().tagRules.list({ matchType: 'exact' });
    expect(exactOnly.data).toHaveLength(1);
    expect(exactOnly.data[0]?.descriptionPattern).toBe('NETFLIX');

    const highConfidence = await client().tagRules.list({ minConfidence: 0.9 });
    expect(highConfidence.data).toHaveLength(1);
    expect(highConfidence.data[0]?.descriptionPattern).toBe('WOOLWORTHS');
  });

  it('filters by isActive, returning only active or only inactive rules', async () => {
    const active = await client().tagRules.apply({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: ['groceries'] },
          },
        ],
      },
      acceptedNewTags: [],
    });
    const inactive = await client().tagRules.apply({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'NETFLIX', matchType: 'exact', tags: ['subscriptions'] },
          },
        ],
      },
      acceptedNewTags: [],
    });
    await client().tagRules.disable(inactive.rules[0]?.id ?? '');

    const inactiveOnly = await client().tagRules.list({ isActive: 'false' });
    expect(inactiveOnly.data).toHaveLength(1);
    expect(inactiveOnly.data[0]?.id).toBe(inactive.rules[0]?.id);
    expect(inactiveOnly.data.every((r) => !r.isActive)).toBe(true);

    const activeOnly = await client().tagRules.list({ isActive: 'true' });
    expect(activeOnly.data).toHaveLength(1);
    expect(activeOnly.data[0]?.id).toBe(active.rules[0]?.id);
    expect(activeOnly.data.every((r) => r.isActive)).toBe(true);
  });

  it('gets a single rule by id and 404s an unknown id', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const id = created.rules[0]?.id ?? '';

    const fetched = await client().tagRules.get(id);
    expect(fetched.data).toMatchObject({
      id,
      descriptionPattern: 'WOOLWORTHS',
      tags: [CUSTOM_TAG],
    });

    await expect(client().tagRules.get('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('edits a rule via the standalone update endpoint', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const id = created.rules[0]?.id ?? '';

    const updated = await client().tagRules.update(id, {
      tags: [CUSTOM_TAG, 'late-night'],
      priority: 3,
    });
    expect(updated.data).toMatchObject({ id, tags: [CUSTOM_TAG, 'late-night'], priority: 3 });

    const refetched = await client().tagRules.get(id);
    expect(refetched.data.tags).toEqual([CUSTOM_TAG, 'late-night']);
  });

  it('404s an update against an unknown id', async () => {
    await expect(client().tagRules.update('nope', { priority: 1 })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects an update that would clear tags to empty', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const id = created.rules[0]?.id ?? '';

    await expect(client().tagRules.update(id, { tags: [] })).rejects.toMatchObject({
      status: 400,
    });

    const refetched = await client().tagRules.get(id);
    expect(refetched.data.tags).toEqual([CUSTOM_TAG]);
  });

  it('disables a rule as a real mutation (isActive flips false, persists on refetch)', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const id = created.rules[0]?.id ?? '';
    expect(created.rules[0]?.isActive).toBe(true);

    const result = await client().tagRules.disable(id);
    expect(result.message).toBe('Tag rule disabled');

    const refetched = await client().tagRules.get(id);
    expect(refetched.data.isActive).toBe(false);
  });

  it('404s disabling an unknown id', async () => {
    await expect(client().tagRules.disable('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('deletes a rule (hard delete, no longer listed)', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const id = created.rules[0]?.id ?? '';

    const result = await client().tagRules.delete(id);
    expect(result.message).toBe('Tag rule deleted');

    await expect(client().tagRules.get(id)).rejects.toMatchObject({ status: 404 });
    const list = await client().tagRules.list();
    expect(list.data).toHaveLength(0);
  });

  it('404s deleting an unknown id', async () => {
    await expect(client().tagRules.delete('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('viewing a rule never mutates its usage telemetry', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const id = created.rules[0]?.id ?? '';
    expect(created.rules[0]?.timesApplied).toBe(0);
    expect(created.rules[0]?.lastUsedAt).toBeNull();

    await client().tagRules.get(id);
    await client().tagRules.list();

    const refetched = await client().tagRules.get(id);
    expect(refetched.data.timesApplied).toBe(0);
    expect(refetched.data.lastUsedAt).toBeNull();
  });
});

describe('tagRules — matchPreview', () => {
  it('previews every DB transaction a candidate pattern matches, with the full-DB total', async () => {
    const db = financeDb.db;
    transactionsService.createTransaction(db, {
      description: 'WOOLWORTHS 1234 SYDNEY',
      account: 'checking',
      amountCents: -5000,
      date: '2026-01-01',
    });
    transactionsService.createTransaction(db, {
      description: 'WOOLWORTHS METRO CBD',
      account: 'checking',
      amountCents: -1200,
      date: '2026-01-02',
    });
    transactionsService.createTransaction(db, {
      description: 'COLES 5678',
      account: 'checking',
      amountCents: -2000,
      date: '2026-01-03',
    });

    const result = await client().tagRules.matchPreview({
      pattern: 'WOOLWORTHS',
      matchType: 'contains',
    });
    expect(result.data.totalCount).toBe(2);
    expect(result.data.matches).toHaveLength(2);
    expect(result.data.matches.every((m) => m.description.includes('WOOLWORTHS'))).toBe(true);
  });
});

describe('tagRules — reject (POPS-2598)', () => {
  it('answers with a message only — never a follow-up proposal', async () => {
    const response = await client().tagRules.reject({ changeSet: addOp, feedback: 'too broad' });
    expect(response.message).toBe('Rejection recorded');
    expect(Object.keys(response)).toEqual(['message']);
  });

  it('persists the rejection with the verbatim feedback and rule shape', async () => {
    await client().tagRules.reject({ changeSet: addOp, feedback: 'Pattern is far too broad' });

    const rejections = tagRuleRejectionsService.listTagRuleRejections(financeDb.db);
    expect(rejections).toHaveLength(1);
    const [rejection] = rejections;
    expect(rejection?.feedback).toBe('Pattern is far too broad');
    expect(rejection?.descriptionPattern).toBe('WOOLWORTHS');
    expect(rejection?.matchType).toBe('contains');
    expect(rejection?.entityId).toBeNull();
    expect(rejection?.tags).toEqual([CUSTOM_TAG]);
    expect(JSON.parse(rejection?.changeSet ?? 'null')).toEqual(addOp);
  });

  it('records a rejection of a ChangeSet that proposes no pattern of its own', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const ruleId = created.rules[0]?.id ?? '';
    const disableChangeSet = { source: 'test', ops: [{ op: 'disable', id: ruleId }] };

    await client().tagRules.reject({ changeSet: disableChangeSet, feedback: 'keep it enabled' });

    const [rejection] = tagRuleRejectionsService.listTagRuleRejections(financeDb.db);
    expect(rejection?.feedback).toBe('keep it enabled');
    expect(rejection?.descriptionPattern).toBeNull();
    expect(rejection?.matchType).toBeNull();
    expect(rejection?.tags).toEqual([]);
    expect(JSON.parse(rejection?.changeSet ?? 'null')).toEqual(disableChangeSet);
  });

  it('rejects an empty feedback string', async () => {
    await expect(
      client().tagRules.reject({ changeSet: addOp, feedback: '' })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('tagRules — applyExisting (retroactive apply, #3660)', () => {
  async function seedRule(): Promise<string> {
    const created = await client().tagRules.apply({
      changeSet: {
        source: 'test',
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'DARLO BAR',
              matchType: 'contains',
              tags: ['bar', 'nights out'],
            },
          },
        ],
      },
      acceptedNewTags: [],
    });
    const id = created.rules[0]?.id;
    if (!id) throw new Error('rule not created');
    return id;
  }

  it('applies to a matching non-manual transaction, merging tags additively', async () => {
    const db = financeDb.db;
    const txn = transactionsService.createTransaction(db, {
      description: 'DARLO BAR SYDNEY',
      account: 'amex',
      amountCents: -4500,
      date: '2026-01-01',
      tags: ['friday'],
    });
    const ruleId = await seedRule();

    const result = await client().tagRules.applyExisting(ruleId);
    expect(result.data).toMatchObject({
      dryRun: false,
      matched: 1,
      updated: 1,
      skippedManual: 0,
    });

    const refetched = await client().transactions.get(txn.id);
    expect(refetched.data.tags.toSorted()).toEqual(['bar', 'friday', 'nights out'].toSorted());

    const rule = await client().tagRules.get(ruleId);
    expect(rule.data.timesApplied).toBe(1);
    expect(rule.data.lastUsedAt).not.toBeNull();
  });

  it('skips a transaction whose matchType is manual (CF017/#3623)', async () => {
    const db = financeDb.db;
    const txn = transactionsService.createTransaction(db, {
      description: 'DARLO BAR SYDNEY',
      account: 'amex',
      amountCents: -4500,
      date: '2026-01-01',
      tags: [],
    });
    // A direct classification-field PATCH stamps matchType: 'manual'.
    transactionsService.updateTransaction(db, txn.id, { entityId: 'ent-user-picked' });
    const ruleId = await seedRule();

    const result = await client().tagRules.applyExisting(ruleId);
    expect(result.data).toMatchObject({ matched: 1, updated: 0, skippedManual: 1 });

    const refetched = await client().transactions.get(txn.id);
    expect(refetched.data.tags).toEqual([]);
  });

  it('a disabled tag rule is a no-op', async () => {
    const db = financeDb.db;
    transactionsService.createTransaction(db, {
      description: 'DARLO BAR SYDNEY',
      account: 'amex',
      amountCents: -4500,
      date: '2026-01-01',
    });
    const ruleId = await seedRule();
    await client().tagRules.disable(ruleId);

    const result = await client().tagRules.applyExisting(ruleId);
    expect(result.data).toMatchObject({ dryRun: false, matched: 0, updated: 0, skippedManual: 0 });
  });

  it('an entity-scoped tag rule only matches its own entity, leaving other entities untouched', async () => {
    const db = financeDb.db;
    const ownEntityTxn = transactionsService.createTransaction(db, {
      description: 'DARLO BAR SYDNEY',
      account: 'amex',
      amountCents: -4500,
      date: '2026-01-01',
      entityId: 'ent-darlo',
    });
    const otherEntityTxn = transactionsService.createTransaction(db, {
      description: 'DARLO BAR SYDNEY',
      account: 'amex',
      amountCents: -4500,
      date: '2026-01-01',
      entityId: 'ent-other',
    });
    const created = await client().tagRules.apply({
      changeSet: {
        source: 'test',
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'DARLO BAR',
              matchType: 'contains',
              tags: ['bar'],
              entityId: 'ent-darlo',
            },
          },
        ],
      },
      acceptedNewTags: [],
    });
    const ruleId = created.rules[0]?.id;
    if (!ruleId) throw new Error('rule not created');

    const result = await client().tagRules.applyExisting(ruleId);
    expect(result.data).toMatchObject({ matched: 1, updated: 1, skippedManual: 0 });

    const ownRow = await client().transactions.get(ownEntityTxn.id);
    expect(ownRow.data.tags).toEqual(['bar']);
    const otherRow = await client().transactions.get(otherEntityTxn.id);
    expect(otherRow.data.tags).toEqual([]);
  });

  it('leaves matchType untouched — the tag-rule path only merges tags', async () => {
    const db = financeDb.db;
    const txn = transactionsService.createTransaction(db, {
      description: 'DARLO BAR SYDNEY',
      account: 'amex',
      amountCents: -4500,
      date: '2026-01-01',
      tags: [],
    });
    db.update(transactions)
      .set({ matchType: 'learned', matchRuleId: 'some-correction-rule', matchConfidence: 0.95 })
      .where(eq(transactions.id, txn.id))
      .run();
    const ruleId = await seedRule();

    const result = await client().tagRules.applyExisting(ruleId);
    expect(result.data).toMatchObject({ matched: 1, updated: 1, skippedManual: 0 });

    const row = transactionsService.getTransaction(db, txn.id);
    expect(row.matchType).toBe('learned');
    expect(row.matchRuleId).toBe('some-correction-rule');
    expect(row.matchConfidence).toBeCloseTo(0.95, 5);
    expect(JSON.parse(row.tags).toSorted()).toEqual(['bar', 'nights out'].toSorted());
  });

  it('dryRun computes the same match set without writing or bumping usage telemetry', async () => {
    const db = financeDb.db;
    const txn = transactionsService.createTransaction(db, {
      description: 'DARLO BAR SYDNEY',
      account: 'amex',
      amountCents: -4500,
      date: '2026-01-01',
      tags: [],
    });
    const ruleId = await seedRule();

    const preview = await client().tagRules.applyExisting(ruleId, { dryRun: true });
    expect(preview.data).toMatchObject({ dryRun: true, matched: 1, updated: 1, skippedManual: 0 });

    const refetched = await client().transactions.get(txn.id);
    expect(refetched.data.tags).toEqual([]);

    const rule = await client().tagRules.get(ruleId);
    expect(rule.data.timesApplied).toBe(0);
    expect(rule.data.lastUsedAt).toBeNull();
  });

  it('a second real apply against the same rule is a no-op (idempotent)', async () => {
    const db = financeDb.db;
    transactionsService.createTransaction(db, {
      description: 'DARLO BAR SYDNEY',
      account: 'amex',
      amountCents: -4500,
      date: '2026-01-01',
      tags: [],
    });
    const ruleId = await seedRule();

    const first = await client().tagRules.applyExisting(ruleId);
    expect(first.data.updated).toBe(1);

    const second = await client().tagRules.applyExisting(ruleId);
    expect(second.data).toMatchObject({ matched: 1, updated: 0, skippedManual: 0 });

    const rule = await client().tagRules.get(ruleId);
    expect(rule.data.timesApplied).toBe(1);
  });

  it('404s applying an unknown rule id', async () => {
    await expect(client().tagRules.applyExisting('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('tagRules — regex patterns (POPS-2600)', () => {
  it('stores a regex pattern verbatim, unlike a contains pattern', async () => {
    const pattern = String.raw`^ACME\s+STORE\.\d+$`;
    const applied = await client().tagRules.apply({
      changeSet: {
        ops: [
          { op: 'add', data: { descriptionPattern: pattern, matchType: 'regex', tags: ['x'] } },
        ],
      },
      acceptedNewTags: [],
    });
    expect(applied.rules[0]?.descriptionPattern).toBe(pattern);
  });

  it('400s an add op whose regex pattern does not compile, writing nothing', async () => {
    await expect(
      client().tagRules.apply({
        changeSet: {
          ops: [
            {
              op: 'add',
              data: { descriptionPattern: '[unclosed', matchType: 'regex', tags: ['x'] },
            },
          ],
        },
        acceptedNewTags: [],
      })
    ).rejects.toMatchObject({ status: 400 });

    const listed = await client().tagRules.list({});
    expect(listed.data).toHaveLength(0);
  });
});
