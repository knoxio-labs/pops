/**
 * Coverage for `suggestTags` pass 4 — the entity defaults the `venue:`
 * backfill (POPS-2609) populates. The pass shipped with no test at all: every
 * existing caller passes an EMPTY `entityDefaultTags` map, so nothing asserted
 * that a contact's defaults reach the suggestion set, carry `source: 'entity'`,
 * or lose to an earlier pass on a duplicate tag.
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

const STONEWALL = 'entity-stonewall';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-entity-default-tags-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('suggestTags — entity defaults (pass 4)', () => {
  it("surfaces a matched contact's defaultTags with source 'entity'", () => {
    const suggested = suggestTags(db, {
      description: 'STONEWALL HOTEL     DARLINGHURST',
      entityId: STONEWALL,
      entityDefaultTags: new Map([[STONEWALL, ['venue:bar']]]),
    });

    expect(suggested).toEqual([{ tag: 'venue:bar', source: 'entity' }]);
  });

  it('contributes nothing for an entity with no defaults (regression: today’s behaviour)', () => {
    const suggested = suggestTags(db, {
      description: 'STONEWALL HOTEL     DARLINGHURST',
      entityId: STONEWALL,
      entityDefaultTags: new Map([['some-other-entity', ['venue:bar']]]),
    });

    expect(suggested).toEqual([]);
  });

  it('contributes nothing when the row resolved to no entity', () => {
    const suggested = suggestTags(db, {
      description: 'STONEWALL HOTEL     DARLINGHURST',
      entityId: null,
      entityDefaultTags: new Map([[STONEWALL, ['venue:bar']]]),
    });

    expect(suggested).toEqual([]);
  });

  it('yields to an earlier pass on the same tag rather than duplicating it', () => {
    transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: 'STONEWALL',
      matchType: 'contains',
      tags: ['venue:bar'],
    });

    const suggested = suggestTags(db, {
      description: 'STONEWALL HOTEL     DARLINGHURST',
      entityId: STONEWALL,
      entityDefaultTags: new Map([[STONEWALL, ['venue:bar']]]),
    });

    expect(suggested).toEqual([{ tag: 'venue:bar', source: 'rule', pattern: 'STONEWALL' }]);
  });

  it('adds the entity default alongside tags the earlier passes contributed', () => {
    const suggested = suggestTags(db, {
      description: 'STONEWALL HOTEL     DARLINGHURST',
      entityId: STONEWALL,
      aiTags: ['occasion:out'],
      knownTags: ['occasion:out'],
      entityDefaultTags: new Map([[STONEWALL, ['venue:bar']]]),
    });

    expect(suggested).toEqual([
      { tag: 'occasion:out', source: 'ai' },
      { tag: 'venue:bar', source: 'entity' },
    ]);
  });

  it('surfaces every default the contact carries, in order', () => {
    const suggested = suggestTags(db, {
      description: 'BWS LIQUOR          NEWTOWN',
      entityId: 'entity-bws',
      entityDefaultTags: new Map([['entity-bws', ['venue:bottleshop', 'contains:alcohol']]]),
    });

    expect(suggested.map((s) => s.tag)).toEqual(['venue:bottleshop', 'contains:alcohol']);
    expect(suggested.every((s) => s.source === 'entity')).toBe(true);
  });
});
