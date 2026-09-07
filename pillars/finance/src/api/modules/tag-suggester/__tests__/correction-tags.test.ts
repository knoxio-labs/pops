/**
 * The suggester's correction pass has no confidence floor, mirroring the
 * classification pass (ADR-053, superseding POPS-2601's "a rule the engine
 * judges too weak to say 'this is Woolworths' must not be trusted to say
 * 'this is Groceries' either" — provenance decides both now, and a stored
 * rule matching by pattern is settled on that alone).
 *
 * The pass is only reached when `correctionTags` is empty — i.e. when the row
 * was resolved by the entity matcher or the AI, the paths that never consult
 * the correction table directly.
 */
import { describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { suggestTags } from '../index.js';

import type Database from 'better-sqlite3';

const ENTITY_ID = 'entity-2601';

/** The matching floor removed by ADR-053/POPS-3129 — kept only as a fixture anchor. */
const OLD_MATCHING_FLOOR = 0.7;

function seedCorrection(raw: Database.Database, id: string, confidence: number, tag: string): void {
  raw
    .prepare(
      `INSERT INTO transaction_corrections (
        id, description_pattern, match_type, entity_id, entity_name, tags, is_active, confidence, priority
      ) VALUES (?, ?, 'contains', ?, ?, ?, 1, ?, 0)`
    )
    .run(id, 'WOOLWORTHS', ENTITY_ID, 'Woolworths', JSON.stringify([tag]), confidence);
}

describe('suggestTags correction pass — no confidence floor (ADR-053)', () => {
  it('contributes a tag from a below-the-old-floor correction on the entity-matcher path', () => {
    const { db, raw } = freshMigratedFinanceDb();
    try {
      seedCorrection(raw, 'corr-weak', OLD_MATCHING_FLOOR - 0.01, 'Groceries');

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

  it('contributes a tag from a correction at the old floor too', () => {
    const { db, raw } = freshMigratedFinanceDb();
    try {
      seedCorrection(raw, 'corr-at-floor', OLD_MATCHING_FLOOR, 'Groceries');

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
      seedCorrection(raw, 'corr-weak', OLD_MATCHING_FLOOR - 0.01, 'Groceries');

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
