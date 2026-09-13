/**
 * The tag-rule write boundary refuses marker-facet tags (POPS-3666) and
 * `temp:` placeholder scopes (POPS-3664) on every create and update, including
 * the reinforce branch an `add` op takes when the rule already exists.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MarkerFacetTagRuleError, PlaceholderEntityScopeError } from '../errors.js';
import { transactionTagRules } from '../schema.js';
import { isPlaceholderEntityId, markerFacetTags } from '../services/tag-rule-write-guards.js';
import {
  createOrReinforceTransactionTagRule,
  createTransactionTagRule,
  updateTransactionTagRule,
} from '../services/transaction-tag-rules.js';
import { freshMigratedFinanceDb, type MigratedFinanceDb } from './migrated-db.js';

let opened: MigratedFinanceDb;

beforeEach(() => {
  opened = freshMigratedFinanceDb();
});

afterEach(() => {
  opened.raw.close();
});

function create(tags: string[], entityId: string | null = null) {
  return createTransactionTagRule(opened.db, {
    descriptionPattern: 'FILEFLOWS',
    matchType: 'contains',
    entityId,
    tags,
  });
}

function ruleCount(): number {
  return opened.db.select().from(transactionTagRules).all().length;
}

function storedTags(id: string): string[] {
  const row = opened.db
    .select()
    .from(transactionTagRules)
    .where(eq(transactionTagRules.id, id))
    .get();
  return JSON.parse(row?.tags ?? '[]') as string[];
}

describe('markerFacetTags', () => {
  it('finds flag: and person: tags regardless of case or padding, and nothing else', () => {
    expect(
      markerFacetTags([
        'contains:software',
        'flag:needs-review',
        ' person:alex ',
        'FLAG:needs-review',
        'flag',
        'enrich:paypal',
      ])
    ).toEqual(['flag:needs-review', ' person:alex ', 'FLAG:needs-review']);
  });
});

describe('isPlaceholderEntityId', () => {
  it.each(['temp:entity:0b8c', ' temp:entity:0b8c', 'TEMP:entity:0b8c', ' TEMP:entity:0b8c '])(
    'treats %j as a placeholder regardless of case or padding',
    (entityId) => {
      expect(isPlaceholderEntityId(entityId)).toBe(true);
    }
  );

  it.each([null, undefined, 'e2f1c3a0-real-contact', 'pending:contact:5d7e'])(
    'does not treat %j as a placeholder',
    (entityId) => {
      expect(isPlaceholderEntityId(entityId)).toBe(false);
    }
  );
});

describe('tag-rule create refuses marker tags and placeholder scopes', () => {
  it.each(['flag:needs-review', 'person:x', 'Flag:needs-review'])('refuses %s', (marker) => {
    expect(() => create(['contains:software', marker])).toThrow(MarkerFacetTagRuleError);
    expect(ruleCount()).toBe(0);
  });

  it('names every offending tag on the error', () => {
    try {
      create(['flag:needs-review', 'contains:software', 'person:x']);
      expect.unreachable('create should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MarkerFacetTagRuleError);
      expect((err as MarkerFacetTagRuleError).tags).toEqual(['flag:needs-review', 'person:x']);
    }
  });

  it('refuses a temp: entity scope', () => {
    expect(() => create(['contains:software'], 'temp:entity:0b8c')).toThrow(
      PlaceholderEntityScopeError
    );
    expect(() => create(['contains:software'], 'temp:stale-scheme')).toThrow(
      PlaceholderEntityScopeError
    );
    expect(ruleCount()).toBe(0);
  });

  it.each([' temp:entity:0b8c', 'TEMP:entity:0b8c', ' TEMP:entity:0b8c '])(
    'refuses a temp: entity scope regardless of case or padding (%j)',
    (entityId) => {
      expect(() => create(['contains:software'], entityId)).toThrow(PlaceholderEntityScopeError);
      expect(ruleCount()).toBe(0);
    }
  );

  it('still accepts a non-marker rule, global or scoped to a real or pending contact', () => {
    create(['contains:software', 'channel:online']);
    create(['contains:software'], 'e2f1c3a0-real-contact');
    create(['contains:software'], 'pending:contact:5d7e');
    expect(ruleCount()).toBe(3);
  });

  it('refuses a marker tag on the reinforce branch, leaving the existing rule untouched', () => {
    const existing = create(['contains:software']);

    expect(() =>
      createOrReinforceTransactionTagRule(opened.db, {
        descriptionPattern: 'fileflows',
        matchType: 'contains',
        entityId: null,
        tags: ['flag:needs-review'],
      })
    ).toThrow(MarkerFacetTagRuleError);
    expect(storedTags(existing.id)).toEqual(['contains:software']);
  });
});

describe('tag-rule update refuses marker tags and placeholder scopes', () => {
  it.each(['flag:needs-review', 'person:x'])('refuses tags carrying %s', (marker) => {
    const rule = create(['contains:software']);

    expect(() =>
      updateTransactionTagRule(opened.db, rule.id, { tags: ['contains:software', marker] })
    ).toThrow(MarkerFacetTagRuleError);
    expect(storedTags(rule.id)).toEqual(['contains:software']);
  });

  it('refuses re-scoping a rule to a temp: entity id', () => {
    const rule = create(['contains:software'], 'e2f1c3a0-real-contact');

    expect(() =>
      updateTransactionTagRule(opened.db, rule.id, { entityId: 'temp:entity:0b8c' })
    ).toThrow(PlaceholderEntityScopeError);
    expect(
      opened.db.select().from(transactionTagRules).where(eq(transactionTagRules.id, rule.id)).get()
        ?.entityId
    ).toBe('e2f1c3a0-real-contact');
  });

  it('refuses re-scoping a rule to a temp: entity id padded or upper-cased', () => {
    const rule = create(['contains:software'], 'e2f1c3a0-real-contact');

    expect(() =>
      updateTransactionTagRule(opened.db, rule.id, { entityId: ' TEMP:entity:0b8c ' })
    ).toThrow(PlaceholderEntityScopeError);
    expect(
      opened.db.select().from(transactionTagRules).where(eq(transactionTagRules.id, rule.id)).get()
        ?.entityId
    ).toBe('e2f1c3a0-real-contact');
  });

  it('accepts a non-marker patch, and one that does not touch tags or scope', () => {
    const rule = create(['contains:software']);

    updateTransactionTagRule(opened.db, rule.id, { tags: ['contains:subscription'] });
    updateTransactionTagRule(opened.db, rule.id, { priority: 2, entityId: null });
    expect(storedTags(rule.id)).toEqual(['contains:subscription']);
  });
});
