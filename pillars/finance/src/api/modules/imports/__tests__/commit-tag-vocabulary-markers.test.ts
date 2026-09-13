/**
 * An import commit refuses a staged tag rule carrying a marker tag in its
 * pre-flight (POPS-3666) — before contacts pre-create and before the SQLite
 * transaction — so the refusal is a 400 that writes nothing, rather than the
 * service-layer guard throwing mid-commit.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  freshMigratedFinanceDb,
  type MigratedFinanceDb,
} from '../../../../db/__tests__/migrated-db.js';
import { ValidationError } from '../../../shared/errors.js';
import { planCommitTagVocabulary } from '../commit-tag-vocabulary.js';

import type { CommitPayload } from '../types.js';

let opened: MigratedFinanceDb;

beforeEach(() => {
  opened = freshMigratedFinanceDb();
});

afterEach(() => {
  opened.raw.close();
});

function payloadWithRuleOp(
  op: CommitPayload['tagRuleChangeSets'][number]['changeSet']['ops'][number]
): CommitPayload {
  return {
    entities: [],
    changeSets: [],
    transactions: [],
    tagRuleChangeSets: [{ changeSet: { ops: [op] } }],
  };
}

describe('planCommitTagVocabulary — marker tags on staged rules', () => {
  it.each(['flag:needs-review', 'person:x'])('refuses an add op carrying %s', (marker) => {
    const payload = payloadWithRuleOp({
      op: 'add',
      data: {
        descriptionPattern: 'ADGUARD',
        matchType: 'contains',
        tags: ['contains:software', marker],
      },
    });

    expect(() => planCommitTagVocabulary(opened.db, payload)).toThrow(ValidationError);
  });

  it('refuses an edit op carrying a marker tag', () => {
    const payload = payloadWithRuleOp({
      op: 'edit',
      id: 'rule-1',
      data: { tags: ['flag:needs-review'] },
    });

    expect(() => planCommitTagVocabulary(opened.db, payload)).toThrow(ValidationError);
  });

  it('clears a staged rule with no marker tag', () => {
    const payload = payloadWithRuleOp({
      op: 'add',
      data: { descriptionPattern: 'ADGUARD', matchType: 'contains', tags: ['contains:software'] },
    });

    expect(planCommitTagVocabulary(opened.db, payload).tagRuleChangeSets).toHaveLength(1);
  });
});
