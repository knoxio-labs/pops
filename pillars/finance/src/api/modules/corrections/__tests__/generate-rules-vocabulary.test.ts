/**
 * The closed-set discipline on rule generation (POPS-3287).
 *
 * This path is the one where a bad tag value is *durable*. The categorizer
 * mislabels one row; a proposal here becomes a stored rule that fires on every
 * future import, above the AI, with nobody in the loop. It nonetheless built
 * its vocabulary from the distinct tags on stored transactions — the ratchet
 * POPS-2606 removed from the categorizer, where a value the model coined
 * survived one commit and came back as vocabulary in the next prompt with the
 * same standing as a deliberate one.
 *
 * The failure mode has no symptom: a prompt offering a coined value is
 * well-formed, and the rule it produces looks like every other rule.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  listClassifiedVocabulary,
  upsertVocabularyTag,
} from '../../../../db/services/tag-vocabulary.js';
import { buildGeneratePrompt, rejectUnknownTags } from '../ai-generate-rules.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { ProposedRule } from '../ai-types.js';

const DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  kind text DEFAULT 'open' NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  description text
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
`;

function freshDb(): { db: FinanceDb; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.exec(DDL);
  return { db: drizzle(raw), raw };
}

function proposal(tags: string[], pattern = 'NETFLIX'): ProposedRule {
  return { descriptionPattern: pattern, matchType: 'contains', tags, reasoning: 'because' };
}

const TXNS = [
  {
    description: 'NETFLIX.COM',
    entityName: 'Netflix',
    amount: -19.99,
    account: 'Everyday',
    currentTags: [],
  },
];

describe('the vocabulary rule generation is offered', () => {
  it('does not confer standing on a tag that is only on a transaction', () => {
    const { db, raw } = freshDb();
    upsertVocabularyTag(db, 'contains:subscription', 'seed');
    raw
      .prepare('INSERT INTO transactions (id, description, tags) VALUES (?, ?, ?)')
      .run('t1', 'NETFLIX.COM', JSON.stringify(['contains:coined-by-a-model']));

    expect(listClassifiedVocabulary(db)).toEqual(['contains:subscription']);
  });

  it('offers nothing from an unclassified facet, which the model must not write', () => {
    const { db } = freshDb();
    upsertVocabularyTag(db, 'contains:subscription', 'seed');
    upsertVocabularyTag(db, 'trip:cairns-2026', 'user');
    upsertVocabularyTag(db, 'person:rosane', 'seed');

    expect(listClassifiedVocabulary(db)).toEqual(['contains:subscription']);
  });
});

describe('buildGeneratePrompt', () => {
  it('states the cardinality so a rule cannot be proposed with two occasions', () => {
    const prompt = buildGeneratePrompt(TXNS, ['occasion:home', 'occasion:out', 'contains:food']);

    expect(prompt).toContain('- occasion: exactly one of [home, out]');
    expect(prompt).toContain('- contains: any of [food]');
    expect(prompt).toContain('may carry at most one value from that axis');
  });

  it('tells the model the listed values are the only ones available', () => {
    const prompt = buildGeneratePrompt(TXNS, ['contains:food']);

    expect(prompt).toContain('A value that is not listed is not available');
  });
});

describe('rejectUnknownTags', () => {
  const KNOWN = ['contains:subscription', 'channel:online', 'occasion:home'];

  it('drops a value the closed vocabulary does not hold and keeps the rest', () => {
    expect(
      rejectUnknownTags([proposal(['contains:subscription', 'contains:invented'])], KNOWN)
    ).toEqual([proposal(['contains:subscription'])]);
  });

  it('drops the whole rule when every value was refused, rather than storing an empty one', () => {
    expect(rejectUnknownTags([proposal(['contains:invented', 'Entertainment'])], KNOWN)).toEqual(
      []
    );
  });

  it('compares case-insensitively, the way the vocabulary itself does', () => {
    expect(rejectUnknownTags([proposal(['Contains:Subscription'])], KNOWN)).toEqual([
      proposal(['Contains:Subscription']),
    ]);
  });

  it('refuses a bare unnamespaced tag, which is what the old flat prompt invited', () => {
    expect(rejectUnknownTags([proposal(['Groceries'])], KNOWN)).toEqual([]);
  });

  it('keeps a rule untouched when every value is known', () => {
    const rule = proposal(['contains:subscription', 'channel:online']);

    expect(rejectUnknownTags([rule], KNOWN)).toEqual([rule]);
  });

  it('judges each rule independently', () => {
    const good = proposal(['occasion:home'], 'ORIGIN');
    const bad = proposal(['contains:invented'], 'NETFLIX');

    expect(rejectUnknownTags([good, bad], KNOWN)).toEqual([good]);
  });
});
