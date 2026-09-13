/**
 * Two matched tag rules writing different values on a single-valued facet must
 * not both reach the suggestion list (POPS-3668): `SQ *PALMS ON OXFORD` matched
 * a `PALMS ON OXFORD` rule and an `SQ *PALMS ON OXFORD` rule and was suggested
 * two venues. The first rule in match order keeps its value.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactionTagRulesService,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { suggestTags } from '../index.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-single-valued-suggest-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const DESCRIPTION = 'SQ *PALMS ON OXFORD';

function suggest(): string[] {
  return suggestTags(db, {
    description: DESCRIPTION,
    entityId: null,
    recordTagRuleUsage: false,
  }).map((suggestion) => suggestion.tag);
}

describe('suggestTags — single-valued facets across matched rules', () => {
  it('keeps exactly one venue, the higher-priority rule’s', () => {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'PALMS ON OXFORD',
      matchType: 'contains',
      tags: ['venue:pub'],
      priority: 1,
    });
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: DESCRIPTION,
      matchType: 'contains',
      tags: ['venue:club'],
      priority: 2,
    });

    expect(suggest().filter((tag) => tag.startsWith('venue:'))).toEqual(['venue:pub']);
  });

  it('lets an exact rule win over a contains rule regardless of priority', () => {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'PALMS ON OXFORD',
      matchType: 'contains',
      tags: ['venue:pub'],
      priority: 1,
    });
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: DESCRIPTION,
      matchType: 'exact',
      tags: ['venue:club'],
      priority: 9,
    });

    expect(suggest().filter((tag) => tag.startsWith('venue:'))).toEqual(['venue:club']);
  });

  it('still unions a multi-valued facet across rules', () => {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'PALMS ON OXFORD',
      matchType: 'contains',
      tags: ['venue:pub', 'contains:food'],
      priority: 1,
    });
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: DESCRIPTION,
      matchType: 'contains',
      tags: ['venue:club', 'contains:alcohol'],
      priority: 2,
    });

    expect(suggest()).toEqual(['venue:pub', 'contains:food', 'contains:alcohol']);
  });
});

describe('suggestTags — single-valued facets across passes (POPS-3734)', () => {
  const ENTITY = 'entity-palms';

  function suggestAcrossPasses(opts: { aiTags?: string[]; entityDefaults?: string[] }): string[] {
    return suggestTags(db, {
      description: DESCRIPTION,
      entityId: ENTITY,
      aiTags: opts.aiTags,
      entityDefaultTags: new Map([[ENTITY, opts.entityDefaults ?? []]]),
      recordTagRuleUsage: false,
    }).map((suggestion) => suggestion.tag);
  }

  function venues(tags: string[]): string[] {
    return tags.filter((tag) => tag.startsWith('venue:'));
  }

  function createTakeawayRule(extraTags: string[] = []): void {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'PALMS ON OXFORD',
      matchType: 'contains',
      tags: ['venue:takeaway', ...extraTags],
    });
  }

  it('keeps the rule’s venue over the AI’s', () => {
    createTakeawayRule();

    expect(venues(suggestAcrossPasses({ aiTags: ['venue:restaurant'] }))).toEqual([
      'venue:takeaway',
    ]);
  });

  it('keeps the rule’s venue over the entity default', () => {
    createTakeawayRule();

    expect(venues(suggestAcrossPasses({ entityDefaults: ['venue:pub'] }))).toEqual([
      'venue:takeaway',
    ]);
  });

  it('keeps the AI’s venue over the entity default', () => {
    expect(
      venues(suggestAcrossPasses({ aiTags: ['venue:restaurant'], entityDefaults: ['venue:pub'] }))
    ).toEqual(['venue:restaurant']);
  });

  it('keeps the first correction venue over a second correction venue and a tag rule’s', () => {
    createTakeawayRule();

    const tags = suggestTags(db, {
      description: DESCRIPTION,
      entityId: null,
      correctionTags: ['venue:bar', 'venue:pub'],
      recordTagRuleUsage: false,
    }).map((suggestion) => suggestion.tag);

    expect(venues(tags)).toEqual(['venue:bar']);
  });

  it('still unions contains across rule, AI and entity default', () => {
    createTakeawayRule(['contains:food']);

    expect(
      suggestAcrossPasses({
        aiTags: ['venue:restaurant', 'contains:alcohol'],
        entityDefaults: ['venue:pub', 'contains:coffee'],
      })
    ).toEqual(['venue:takeaway', 'contains:food', 'contains:alcohol', 'contains:coffee']);
  });
});
