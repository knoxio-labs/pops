/**
 * Orphaned `entity_id` detection + repair (issue #3615, CF009).
 *
 * Runs against a real on-disk finance.db so the cross-table reassignment SQL is
 * exercised end-to-end. Fixtures model the exact post-reseed shape: dead
 * real-UUID ids carrying a denormalized `entity_name` that still resolves to a
 * live contact by name, plus the awkward cases (no name, unknown name, one id
 * seen under two names, a name that isn't unique in the live set).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  entityOrphansService,
  openFinanceDb,
  transactionCorrections,
  transactions,
  transactionTagRules,
  type LiveEntityRef,
  type OpenedFinanceDb,
} from '../index.js';
import { seededAccountId } from './seeded-account.js';

let tmpDir: string;
let opened: OpenedFinanceDb;

function txn(entityId: string | null, entityName: string | null): void {
  opened.db
    .insert(transactions)
    .values({
      description: `txn-${entityId ?? 'none'}-${entityName ?? 'none'}`,
      accountId: seededAccountId(opened.db, 'Amex'),
      amountCents: -1000,
      date: '2026-01-01',
      type: 'purchase',
      lastEditedTime: '2026-01-01T00:00:00.000Z',
      entityId,
      entityName,
    })
    .run();
}

function correction(entityId: string | null, entityName: string | null): void {
  opened.db
    .insert(transactionCorrections)
    .values({ descriptionPattern: `corr-${entityId ?? 'none'}`, entityId, entityName })
    .run();
}

function tagRule(entityId: string | null): void {
  opened.db
    .insert(transactionTagRules)
    .values({ descriptionPattern: `rule-${entityId ?? 'none'}`, entityId })
    .run();
}

/** Live contact set: two normal contacts + a name deliberately duplicated to
 * exercise the "live name not unique" ambiguity guard. */
const LIVE: LiveEntityRef[] = [
  { id: 'live-wool', name: 'Woolworths' },
  { id: 'live-ikea', name: 'IKEA' },
  { id: 'live-dup-a', name: 'Dupe Co' },
  { id: 'live-dup-b', name: 'Dupe Co' },
];

/** Seed the canonical mixed fixture used by most cases. */
function seedMixedFixture(): void {
  txn('dead-wool', 'Woolworths'); // orphan → resolves by name
  tagRule('dead-wool'); // same dead id, no name here → repaired transitively
  txn('live-ikea', 'IKEA'); // live — not an orphan
  correction('dead-ikea', 'IKEA'); // orphan on a different table → resolves by name
  tagRule('dead-noname'); // orphan only on tag_rules, no name anywhere → unmatched
  txn('dead-unknown', 'Ghost Merchant'); // orphan, name matches no live contact → unmatched
  txn('dead-ambig', 'Woolworths'); // one id, two names across tables → ambiguous
  correction('dead-ambig', 'IKEA');
  txn('dead-dup', 'Dupe Co'); // name not unique in live set → ambiguous
  txn(null, 'Nulls ignored'); // null id → ignored entirely
  txn('temp:entity:abc', 'Temp'); // placeholder → excluded
  txn('pending:contact:xyz', 'Pending'); // outbox placeholder → excluded
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-orphans-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('listDistinctEntityRefs', () => {
  it('dedupes across tables, merges names, and drops placeholders + nulls', () => {
    seedMixedFixture();
    const refs = entityOrphansService.listDistinctEntityRefs(opened.db);
    const byId = new Map(refs.map((r) => [r.entityId, r.names]));

    // placeholders + null never appear
    expect(byId.has('temp:entity:abc')).toBe(false);
    expect(byId.has('pending:contact:xyz')).toBe(false);
    expect(refs.every((r) => r.entityId !== '')).toBe(true);

    // dead-wool seen on a txn (named) and a tag_rule (no name) → one merged ref
    expect(byId.get('dead-wool')).toEqual(['Woolworths']);
    // dead-ambig seen under two distinct names
    expect(new Set(byId.get('dead-ambig'))).toEqual(new Set(['Woolworths', 'IKEA']));
    // tag_rule-only id → no names
    expect(byId.get('dead-noname')).toEqual([]);
  });
});

describe('planEntityRepair', () => {
  it('remaps by name, and buckets unmatched/ambiguous without guessing', () => {
    seedMixedFixture();
    const plan = entityOrphansService.planEntityRepair(opened.db, LIVE);

    expect(plan.remap.get('dead-wool')).toBe('live-wool');
    expect(plan.remap.get('dead-ikea')).toBe('live-ikea');
    expect(plan.remap.size).toBe(2);

    const unmatchedIds = new Set(plan.unmatched.map((r) => r.entityId));
    expect(unmatchedIds).toEqual(new Set(['dead-noname', 'dead-unknown']));

    const ambiguousIds = new Set(plan.ambiguous.map((r) => r.entityId));
    expect(ambiguousIds).toEqual(new Set(['dead-ambig', 'dead-dup']));

    // a live id is never a repair candidate
    expect(plan.remap.has('live-ikea')).toBe(false);
  });

  it('treats an id that already matches a live contact as not-orphaned', () => {
    txn('live-wool', 'Woolworths');
    const plan = entityOrphansService.planEntityRepair(opened.db, LIVE);
    expect(plan.remap.size).toBe(0);
    expect(plan.unmatched).toHaveLength(0);
    expect(plan.ambiguous).toHaveLength(0);
  });
});

describe('countOrphanedRows', () => {
  it('counts orphan ROWS per table and distinct ids, excluding placeholders/live', () => {
    seedMixedFixture();
    const liveIds = new Set(LIVE.map((e) => e.id));
    const counts = entityOrphansService.countOrphanedRows(opened.db, liveIds);

    // txns: dead-wool, dead-unknown, dead-ambig, dead-dup (live-ikea/null/placeholders excluded)
    expect(counts.transactions).toBe(4);
    // corrections: dead-ikea, dead-ambig
    expect(counts.corrections).toBe(2);
    // tag_rules: dead-wool, dead-noname
    expect(counts.tagRules).toBe(2);
    // distinct: wool, unknown, ambig, dup, ikea, noname
    expect(counts.distinctIds).toBe(6);
  });
});

describe('applyEntityRepair', () => {
  it('rewrites every table for a remapped id, reports counts, and is idempotent', () => {
    seedMixedFixture();
    const plan = entityOrphansService.planEntityRepair(opened.db, LIVE);

    const result = entityOrphansService.applyEntityRepair(opened.db, plan.remap);
    expect(result.idsRepaired).toBe(2);
    // dead-wool → 1 txn + 1 tag_rule; dead-ikea → 1 correction
    expect(result.counts).toEqual({ transactions: 1, corrections: 1, tagRules: 1 });

    // the transitively-repaired tag_rule now points at the live id
    const rewrittenRule = opened.db
      .select()
      .from(transactionTagRules)
      .where(eq(transactionTagRules.entityId, 'live-wool'))
      .all();
    expect(rewrittenRule).toHaveLength(1);
    // no dead id survives
    expect(
      opened.db.select().from(transactions).where(eq(transactions.entityId, 'dead-wool')).all()
    ).toHaveLength(0);

    // re-applying the SAME remap now rewrites nothing (ids already live)
    const second = entityOrphansService.applyEntityRepair(opened.db, plan.remap);
    expect(second.counts).toEqual({ transactions: 0, corrections: 0, tagRules: 0 });

    // and a fresh plan finds no more repairable orphans
    const after = entityOrphansService.planEntityRepair(opened.db, LIVE);
    expect(after.remap.size).toBe(0);
  });

  it('leaves unmatched and ambiguous orphans untouched', () => {
    seedMixedFixture();
    const plan = entityOrphansService.planEntityRepair(opened.db, LIVE);
    entityOrphansService.applyEntityRepair(opened.db, plan.remap);

    // dead-ambig (ambiguous) and dead-unknown (unmatched) are still present as-is
    expect(
      opened.db.select().from(transactions).where(eq(transactions.entityId, 'dead-ambig')).all()
    ).toHaveLength(1);
    expect(
      opened.db.select().from(transactions).where(eq(transactions.entityId, 'dead-unknown')).all()
    ).toHaveLength(1);
  });
});
