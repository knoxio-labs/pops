/**
 * Cross-matcher parity: every entry point that answers "does this pattern
 * match this description" must return the same verdict for the same triple
 * (POPS-2600).
 *
 * Four independent implementations used to exist. They disagreed on case
 * folding (a raw SQL `LIKE` with no `upper()`), on digit stripping, and on the
 * regex `i` flag — so one correction row could classify a transaction through
 * the classification pass and contribute no tags through the suggester's
 * correction pass, in the same suggestion run.
 *
 * The reference verdict is the shared predicate itself; each row below asserts
 * every other path agrees with it. Since POPS-2640 that predicate picks its
 * subject by match type — `regex` against the raw description, `exact` and
 * `contains` against the normalised one — so every entry point has to hand it
 * both forms. Parity is what proves none of them dropped one.
 *
 * The `legacyRow` triples are seeded through raw SQL because the pattern they
 * carry is one the write boundary now rejects or reshapes — they stand in for
 * rows already on disk. `legacy lowercase regex literal` is the one that
 * proves the headline defect: before the collapse the classification pass
 * (`i` flag) fired on it while the suggester's correction pass (no `i` flag)
 * did not, so the same row classified a transaction and contributed no tags.
 */
import { describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../db/__tests__/migrated-db.js';
import {
  transactionCorrectionsService,
  transactionTagRulesService,
  type FinanceDb,
} from '../../../db/index.js';
import { dollarsToCents } from '../../../money.js';
import { findAllMatchingCorrectionFromRules } from '../corrections/pure.js';
import { previewTagRuleChangeSet } from '../tag-rules/preview.js';
import { applyTagRuleToExistingTransactions } from '../tag-rules/retroactive-apply.js';
import { findMatchingTagRules } from '../tag-suggester/tag-rule-matching.js';

import type Database from 'better-sqlite3';

import type { PatternMatchType } from '../../../contract/pattern-match.js';

const {
  describeForMatching,
  findAllMatchingTransactionCorrections,
  findAllMatchingTransactionCorrectionsFromDb,
  listTransactionCorrections,
  patternMatchesDescription,
  previewRuleMatchTransactions,
} = transactionCorrectionsService;

interface Triple {
  name: string;
  pattern: string;
  matchType: PatternMatchType;
  description: string;
  /**
   * Seed the rule rows with raw SQL, bypassing the services. Used for a
   * pattern the write boundary now rejects but which older rows may still
   * carry — the matchers must still agree about it.
   */
  legacyRow?: true;
}

const TRIPLES: Triple[] = [
  {
    name: 'exact, mixed case',
    pattern: 'Coffee Shop',
    matchType: 'exact',
    description: 'COFFEE SHOP',
  },
  {
    name: 'exact, digit-bearing descriptor',
    pattern: 'St. George',
    matchType: 'exact',
    description: 'ST GEORGE 4471',
  },
  {
    name: 'lowercase contains pattern',
    pattern: 'coffee',
    matchType: 'contains',
    description: 'THE COFFEE SHOP',
  },
  {
    name: 'contains, digit-bearing descriptor',
    pattern: 'Woolworths',
    matchType: 'contains',
    description: 'Woolworths 1234 Sydney',
  },
  {
    name: 'contains, diacritics',
    pattern: 'Cafe',
    matchType: 'contains',
    description: 'CAFÉ MOZART',
  },
  {
    name: 'contains, hyphen',
    pattern: 'UBER-EATS',
    matchType: 'contains',
    description: 'UBER EATS 55',
  },
  {
    name: 'contains, ampersand',
    pattern: 'M&S',
    matchType: 'contains',
    description: 'MS FOOD HALL',
  },
  {
    name: 'contains, no match',
    pattern: 'NETFLIX',
    matchType: 'contains',
    description: 'SPOTIFY AU',
  },
  {
    name: 'lowercase regex literal',
    pattern: 'coffee',
    matchType: 'regex',
    description: 'THE COFFEE SHOP',
  },
  {
    name: 'regex, anchored across a digit run',
    pattern: '^WOOLWORTHS \\d{4} SYDNEY$',
    matchType: 'regex',
    description: 'Woolworths 1234 Sydney',
  },
  {
    name: 'regex, anchor that only held against the normalised form',
    pattern: '^WOOLWORTHS SYDNEY$',
    matchType: 'regex',
    description: 'Woolworths 1234 Sydney',
  },
  {
    name: 'regex, diacritic not folded',
    pattern: 'CAFE',
    matchType: 'regex',
    description: 'CAFÉ MOZART',
  },
  {
    name: 'regex, alternation',
    pattern: 'uber|lyft',
    matchType: 'regex',
    description: 'LYFT RIDE',
  },
  { name: 'regex, no match', pattern: '^NETFLIX', matchType: 'regex', description: 'SPOTIFY AU' },
  {
    name: 'legacy lowercase regex literal',
    pattern: 'coffee',
    matchType: 'regex',
    description: 'THE COFFEE SHOP',
    legacyRow: true,
  },
  {
    name: 'legacy regex with a digit class',
    pattern: '\\d{4}',
    matchType: 'regex',
    description: 'CARD 4471 PURCHASE',
    legacyRow: true,
  },
  {
    name: 'legacy regex with a digit class, no match',
    pattern: '\\d{5}',
    matchType: 'regex',
    description: 'CARD 4471 PURCHASE',
    legacyRow: true,
  },
  {
    name: 'legacy uncompilable regex',
    pattern: '[unclosed',
    matchType: 'regex',
    description: 'UNCLOSED BRACKET',
    legacyRow: true,
  },
];

const ENTITY_ID = 'entity-parity';
const RULE_TAG = 'Parity';
/** A tag no seeded rule supplies, so the preview's diff is non-empty exactly when the pattern matches. */
const PREVIEW_PROBE_TAG = 'ParityProbe';

function seedTransaction(raw: Database.Database, description: string): void {
  const accountId = raw
    .prepare(`SELECT id FROM accounts WHERE name = ? COLLATE NOCASE`)
    .get('Amex') as { id: string } | undefined;
  if (!accountId) throw new Error("No seeded account named 'Amex' — did 0083_accounts.sql run?");
  raw
    .prepare(
      `INSERT INTO transactions (
        id, description, account_id, amount_cents, date, type, checksum, entity_id, entity_name, last_edited_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'txn-parity',
      description,
      accountId.id,
      dollarsToCents(-10),
      '2025-01-01',
      'Purchase',
      'sum-parity',
      ENTITY_ID,
      'Parity Co',
      '2025-01-01T00:00:00.000Z'
    );
}

function seedLegacyRows(raw: Database.Database, t: Triple): string {
  raw
    .prepare(
      `INSERT INTO transaction_corrections (
        id, description_pattern, match_type, entity_id, entity_name, tags, is_active, confidence, priority
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0.9, 0)`
    )
    .run('corr-legacy', t.pattern, t.matchType, ENTITY_ID, 'Parity Co', JSON.stringify([RULE_TAG]));
  raw
    .prepare(
      `INSERT INTO transaction_tag_rules (
        id, description_pattern, match_type, entity_id, tags, is_active, confidence, priority
      ) VALUES (?, ?, ?, NULL, ?, 1, 0.95, 0)`
    )
    .run('rule-legacy', t.pattern, t.matchType, JSON.stringify([RULE_TAG]));
  return 'rule-legacy';
}

function seedServiceRows(db: FinanceDb, t: Triple): string {
  transactionCorrectionsService.createOrUpdateTransactionCorrection(db, {
    descriptionPattern: t.pattern,
    matchType: t.matchType,
    entityId: ENTITY_ID,
    entityName: 'Parity Co',
    tags: [RULE_TAG],
  });
  return transactionTagRulesService.createTransactionTagRule(db, {
    descriptionPattern: t.pattern,
    matchType: t.matchType,
    tags: [RULE_TAG],
  }).id;
}

function verdictsFor(t: Triple): Record<string, boolean> {
  const { db, raw } = freshMigratedFinanceDb();
  try {
    seedTransaction(raw, t.description);
    const ruleId = t.legacyRow ? seedLegacyRows(raw, t) : seedServiceRows(db, t);

    // The preview reports a before/after diff, not "did this pattern match"
    // (POPS-2599), so the probed op has to propose a tag nothing else already
    // supplies — otherwise a matching pattern correctly reports no change.
    const preview = previewTagRuleChangeSet(db, {
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: t.pattern,
              matchType: t.matchType,
              tags: [RULE_TAG, PREVIEW_PROBE_TAG],
            },
          },
        ],
      },
      transactions: [{ transactionId: 'txn-parity', description: t.description }],
      maxPreviewItems: 10,
    });

    return {
      sharedPredicate: patternMatchesDescription(
        t.pattern,
        t.matchType,
        describeForMatching(t.description)
      ),
      classificationPass:
        findAllMatchingTransactionCorrectionsFromDb(db, t.description, null, 0).length > 0,
      suggesterCorrectionPass:
        findAllMatchingTransactionCorrections(db, t.description, null, 0).length > 0,
      inMemoryCorrectionMatch:
        findAllMatchingCorrectionFromRules(
          t.description,
          listTransactionCorrections(db, { limit: 100, offset: 0 }).rows,
          null,
          0
        ).length > 0,
      tagRuleLivePath: findMatchingTagRules(db, t.description, null).length > 0,
      tagRuleChangeSetPreview: preview.affected.length > 0,
      tagRuleRetroactiveApply:
        applyTagRuleToExistingTransactions(db, ruleId, { dryRun: true }).matched > 0,
      ruleMatchPreview:
        previewRuleMatchTransactions(db, {
          pattern: t.pattern,
          matchType: t.matchType,
          limit: 10,
          offset: 0,
        }).totalCount > 0,
    };
  } finally {
    raw.close();
  }
}

describe('cross-matcher parity', () => {
  for (const t of TRIPLES) {
    it(`every matcher agrees: ${t.name}`, () => {
      const verdicts = verdictsFor(t);
      const expected = verdicts.sharedPredicate;
      for (const [entryPoint, verdict] of Object.entries(verdicts)) {
        expect(`${entryPoint}=${verdict}`).toBe(`${entryPoint}=${expected}`);
      }
    });
  }

  it('the fixture covers both verdicts, so parity is not vacuously true', () => {
    const results = TRIPLES.map((t) => verdictsFor(t).sharedPredicate);
    expect(results).toContain(true);
    expect(results).toContain(false);
  });
});
