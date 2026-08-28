/**
 * The suggester's correction pass must honour the same confidence floor the
 * classification pass does (POPS-2601).
 *
 * The pass is only reached when `correctionTags` is empty — i.e. when the row
 * was resolved by the entity matcher or the AI, the paths that never consulted
 * the correction table and so never applied `MIN_MATCH_CONFIDENCE`. A rule the
 * engine judges too weak to say "this is Woolworths" must not be trusted to
 * say "this is Groceries" either.
 *
 * Sub-floor rows are seeded with raw SQL because the write boundary clamps
 * `confidence` to the floor: a row can only get below it by explicit
 * demotion.
 */
import { describe, expect, it } from 'vitest';

import { MIN_MATCH_CONFIDENCE } from '../../../../contract/corrections-constants.js';
import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { suggestTags } from '../index.js';

import type Database from 'better-sqlite3';

const ENTITY_ID = 'entity-2601';

function seedCorrection(raw: Database.Database, id: string, confidence: number, tag: string): void {
  raw
    .prepare(
      `INSERT INTO transaction_corrections (
        id, description_pattern, match_type, entity_id, entity_name, tags, is_active, confidence, priority
      ) VALUES (?, ?, 'contains', ?, ?, ?, 1, ?, 0)`
    )
    .run(id, 'WOOLWORTHS', ENTITY_ID, 'Woolworths', JSON.stringify([tag]), confidence);
}

describe('suggestTags correction pass confidence floor', () => {
  it('contributes no tag from a sub-floor correction on the entity-matcher path', () => {
    const { db, raw } = freshMigratedFinanceDb();
    try {
      seedCorrection(raw, 'corr-weak', MIN_MATCH_CONFIDENCE - 0.01, 'Groceries');

      const suggestions = suggestTags(db, {
        description: 'WOOLWORTHS 1234 SYDNEY',
        entityId: ENTITY_ID,
        correctionTags: [],
      });

      expect(suggestions).toEqual([]);
    } finally {
      raw.close();
    }
  });

  it('contributes a tag from a correction exactly at the floor', () => {
    const { db, raw } = freshMigratedFinanceDb();
    try {
      seedCorrection(raw, 'corr-at-floor', MIN_MATCH_CONFIDENCE, 'Groceries');

      const suggestions = suggestTags(db, {
        description: 'WOOLWORTHS 1234 SYDNEY',
        entityId: ENTITY_ID,
        correctionTags: [],
      });

      expect(suggestions).toEqual([{ tag: 'Groceries', source: 'rule', pattern: 'WOOLWORTHS' }]);
    } finally {
      raw.close();
    }
  });

  it('still trusts caller-supplied correction tags without re-scanning', () => {
    const { db, raw } = freshMigratedFinanceDb();
    try {
      seedCorrection(raw, 'corr-weak', MIN_MATCH_CONFIDENCE - 0.01, 'Groceries');

      const suggestions = suggestTags(db, {
        description: 'WOOLWORTHS 1234 SYDNEY',
        entityId: ENTITY_ID,
        correctionTags: ['Supplied'],
        correctionPattern: 'WOOLWORTHS',
      });

      expect(suggestions).toEqual([{ tag: 'Supplied', source: 'rule', pattern: 'WOOLWORTHS' }]);
    } finally {
      raw.close();
    }
  });
});
