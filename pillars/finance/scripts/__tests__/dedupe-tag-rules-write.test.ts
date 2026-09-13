/**
 * The write half of `dedupe-tag-rules.ts`, against a migrated database.
 *
 * Covers what the plan is used to do, which cannot be undone: which rows are
 * deleted, what the survivor carries afterwards, and that a dry run and an
 * unresolved conflict write nothing.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  freshMigratedFinanceDb,
  type MigratedFinanceDb,
} from '../../src/db/__tests__/migrated-db.js';
import { transactionTagRules } from '../../src/db/index.js';
import { clusterKey } from '../dedupe-tag-rules-plan.js';
import { runDedupe } from '../dedupe-tag-rules.js';

let opened: MigratedFinanceDb;

function seed(id: string, overrides: Partial<typeof transactionTagRules.$inferInsert> = {}): void {
  opened.db
    .insert(transactionTagRules)
    .values({
      id,
      descriptionPattern: 'MCDONALDS',
      matchType: 'contains',
      entityId: 'entity-mcd',
      tags: '["venue:takeaway"]',
      ...overrides,
    })
    .run();
}

function row(id: string) {
  return opened.db.select().from(transactionTagRules).where(eq(transactionTagRules.id, id)).get();
}

function snapshot() {
  return opened.db.select().from(transactionTagRules).orderBy(transactionTagRules.id).all();
}

beforeEach(() => {
  opened = freshMigratedFinanceDb();

  seed('mcd-1', { timesApplied: 12, lastUsedAt: '2026-09-01' });
  seed('mcd-2', { timesApplied: 12, createdAt: '2026-01-01 00:00:00', lastUsedAt: '2026-09-10' });
  seed('mcd-3', { timesApplied: 1 });

  seed('saltire-1', {
    descriptionPattern: 'SP SALTIRE ESTATE',
    entityId: 'entity-saltire',
    tags: '["occasion:out","venue:bottle-shop"]',
    timesApplied: 3,
  });
  seed('saltire-2', {
    descriptionPattern: 'SP SALTIRE ESTATE',
    entityId: 'entity-saltire',
    tags: '["occasion:home"]',
  });

  seed('coles-real', { descriptionPattern: 'COLES', entityId: 'entity-coles' });
  seed('coles-leak', { descriptionPattern: 'COLES', entityId: 'temp:entity:0b8c' });

  seed('bunnings', { descriptionPattern: 'BUNNINGS', entityId: null, timesApplied: 4 });
});

afterEach(() => {
  opened.raw.close();
});

describe('runDedupe', () => {
  it('writes nothing on a dry run', () => {
    const before = snapshot();

    const report = runDedupe(opened.db, { write: false, resolutions: new Map() });

    expect(report.written).toBeNull();
    expect(report.plans.map((plan) => plan.kind).toSorted()).toEqual([
      'conflict',
      'delete-temp-scope',
      'merge',
      'ok',
      'ok',
    ]);
    expect(snapshot()).toEqual(before);
  });

  it('merges identical rules onto the survivor and deletes the rest', () => {
    runDedupe(opened.db, { write: true, resolutions: new Map() });

    expect(row('mcd-1')).toBeUndefined();
    expect(row('mcd-3')).toBeUndefined();
    expect(row('mcd-2')).toMatchObject({
      tags: '["venue:takeaway"]',
      timesApplied: 25,
      lastUsedAt: '2026-09-10',
      isActive: true,
    });
  });

  it('deletes the temp-scoped rule and leaves the real one and the singleton untouched', () => {
    const coles = row('coles-real');
    const bunnings = row('bunnings');

    const report = runDedupe(opened.db, { write: true, resolutions: new Map() });

    expect(row('coles-leak')).toBeUndefined();
    expect(row('coles-real')).toEqual(coles);
    expect(row('bunnings')).toEqual(bunnings);
    expect(report.written).toEqual({ deleted: 3, merged: 1, resolved: 0 });
  });

  it('surfaces disagreeing rules without writing them', () => {
    const saltire = [row('saltire-1'), row('saltire-2')];

    runDedupe(opened.db, { write: true, resolutions: new Map() });

    expect([row('saltire-1'), row('saltire-2')]).toEqual(saltire);
  });

  it('applies a resolution: one row with the chosen tags, the other deleted', () => {
    const key = clusterKey('contains', 'SP SALTIRE ESTATE', 'entity-saltire');

    const report = runDedupe(opened.db, {
      write: true,
      resolutions: new Map([[key, ['occasion:home', 'venue:bottle-shop']]]),
    });

    expect(report.written).toEqual({ deleted: 4, merged: 1, resolved: 1 });
    expect(row('saltire-2')).toBeUndefined();
    expect(row('saltire-1')).toMatchObject({
      tags: '["occasion:home","venue:bottle-shop"]',
      timesApplied: 3,
    });
  });

  it('refuses to write anything when a resolution names no conflict', () => {
    const before = snapshot();

    const report = runDedupe(opened.db, {
      write: true,
      resolutions: new Map([['contains|NOT A CLUSTER|*', ['venue:pub']]]),
    });

    expect(report.unusedResolutionKeys).toEqual(['contains|NOT A CLUSTER|*']);
    expect(report.written).toBeNull();
    expect(snapshot()).toEqual(before);
  });

  it('ignores inactive rules', () => {
    seed('bunnings-off', { descriptionPattern: 'BUNNINGS', entityId: null, isActive: false });

    runDedupe(opened.db, { write: true, resolutions: new Map() });

    expect(row('bunnings-off')).toBeDefined();
    expect(row('bunnings')).toMatchObject({ timesApplied: 4 });
  });
});
