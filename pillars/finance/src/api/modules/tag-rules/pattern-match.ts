/**
 * Pure text-matching predicate for a tag rule's `(descriptionPattern,
 * matchType)` against an already-normalized transaction description. Shared by
 * the ChangeSet suggestion-impact preview (`preview.ts`) and the
 * retroactive-apply batch operation (`retroactive-apply.ts`, #3660) so both
 * paths agree on what "this rule matches this transaction" means.
 */
import { transactionCorrectionsService } from '../../../db/index.js';

const { normalizeDescription } = transactionCorrectionsService;

export interface TagRulePattern {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
}

export function tagRulePatternMatches(
  rule: TagRulePattern,
  normalizedDescription: string
): boolean {
  if (rule.matchType === 'regex') {
    try {
      return new RegExp(rule.descriptionPattern, 'i').test(normalizedDescription);
    } catch {
      return false;
    }
  }
  const pattern = normalizeDescription(rule.descriptionPattern);
  return rule.matchType === 'exact'
    ? normalizedDescription === pattern
    : normalizedDescription.includes(pattern);
}
