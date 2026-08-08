/**
 * Smoke test that the finance schemas resolve from the package barrel
 * with the expected drizzle SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set MUST cover every table the pillar's schema
 * barrel exports (`../schema`), so a table added on one side and forgotten
 * on the other trips this file.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  aiUsage,
  budgets,
  tagVocabulary,
  transactionCorrections,
  transactionTagRules,
  transactions,
  wishList,
} from '../schema.js';

describe('us-03-relocate-finance-schemas', () => {
  it.each([
    [budgets, 'budgets'],
    [tagVocabulary, 'tag_vocabulary'],
    [transactionCorrections, 'transaction_corrections'],
    [transactionTagRules, 'transaction_tag_rules'],
    [transactions, 'transactions'],
    [wishList, 'wish_list'],
    [aiUsage, 'ai_usage'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
