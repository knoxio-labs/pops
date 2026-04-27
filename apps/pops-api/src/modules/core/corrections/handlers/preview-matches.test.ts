/**
 * Unit tests for the previewMatches handler — drives the manual rule
 * create/edit dialog (#2187) and underpins the e2e flows in #2119 / #2135.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { seedTransaction, setupTestContext } from '../../../../shared/test-utils.js';
import { previewMatches } from './preview-matches.js';

const ctx = setupTestContext();

describe('previewMatches', () => {
  let db: ReturnType<typeof ctx.setup>['db'];

  beforeEach(() => {
    const result = ctx.setup();
    db = result.db;
  });

  afterEach(() => {
    ctx.teardown();
  });

  it('returns transactions matching a contains pattern', () => {
    seedTransaction(db, { description: 'Woolworths Metro' });
    seedTransaction(db, { description: 'Woolworths' });
    seedTransaction(db, { description: 'Coles Local' });
    seedTransaction(db, { description: 'Netflix Subscription' });

    const result = previewMatches({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
    });

    expect(result.total).toBe(2);
    expect(result.matches.map((m) => m.description).toSorted()).toEqual([
      'Woolworths',
      'Woolworths Metro',
    ]);
    expect(result.scanned).toBe(4);
    expect(result.truncated).toBe(false);
  });

  it('returns nothing when no transaction matches', () => {
    seedTransaction(db, { description: 'Coles Local' });
    seedTransaction(db, { description: 'Shell Service Station' });

    const result = previewMatches({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
    });

    expect(result.total).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it('matches exactly when matchType is exact (after normalisation)', () => {
    seedTransaction(db, { description: 'Netflix' });
    seedTransaction(db, { description: 'Netflix Subscription' });

    const result = previewMatches({
      descriptionPattern: 'NETFLIX',
      matchType: 'exact',
    });

    // exact mode requires the entire normalised description to equal the
    // pattern — `Netflix Subscription` should NOT match.
    expect(result.total).toBe(1);
    expect(result.matches[0]?.description).toBe('Netflix');
  });

  it('honours regex matchType', () => {
    seedTransaction(db, { description: 'Shell Service Station' });
    seedTransaction(db, { description: 'Coles Express' });
    seedTransaction(db, { description: 'Woolworths' });

    const result = previewMatches({
      descriptionPattern: 'SHELL|COLES',
      matchType: 'regex',
    });

    expect(result.total).toBe(2);
    const descriptions = result.matches.map((m) => m.description).toSorted();
    expect(descriptions).toEqual(['Coles Express', 'Shell Service Station']);
  });

  it('returns invalid regex as zero matches without throwing', () => {
    seedTransaction(db, { description: 'Woolworths' });

    const result = previewMatches({
      descriptionPattern: '([',
      matchType: 'regex',
    });

    expect(result.total).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it('truncates results to the supplied limit and reports truncated=true', () => {
    for (let i = 0; i < 5; i += 1) {
      seedTransaction(db, { description: `Woolworths #${i}` });
    }

    const result = previewMatches({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
      limit: 3,
    });

    expect(result.total).toBe(5);
    expect(result.matches).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('returns the transaction shape required by the dialog (id, description, account, amount, date, tags, entityName)', () => {
    seedTransaction(db, {
      description: 'Woolworths',
      account: 'ANZ-Visa',
      amount: -42.5,
      date: '2026-04-20',
      tags: '["Groceries"]',
      entity_name: 'Woolworths',
    });

    const result = previewMatches({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
    });

    const match = result.matches[0];
    expect(match).toBeDefined();
    expect(match?.account).toBe('ANZ-Visa');
    expect(match?.amount).toBe(-42.5);
    expect(match?.date).toBe('2026-04-20');
    expect(match?.tags).toEqual(['Groceries']);
    expect(match?.entityName).toBe('Woolworths');
  });
});
