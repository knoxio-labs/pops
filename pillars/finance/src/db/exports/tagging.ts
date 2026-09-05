/**
 * The tag vocabulary and everything that assigns from it: auto-tagging rules
 * and their rejections, coverage reporting, and the per-venue defaults that
 * seed a transaction's tags.
 *
 * One of the groups re-exported by `../index.ts` — see that file's header for
 * why the barrel is split rather than flat.
 */
export * as tagVocabularyService from '../services/tag-vocabulary.js';

export { type TagVocabularyRow, type TagVocabularySource } from '../services/tag-vocabulary.js';

export * as tagRuleRejectionsService from '../services/tag-rule-rejections.js';

export {
  type TagRuleRejection,
  type TagRuleRejectionRow,
  type RecordTagRuleRejectionInput,
} from '../services/tag-rule-rejections.js';

export * as transactionTagRulesService from '../services/transaction-tag-rules.js';

export {
  type TransactionTagRuleRow,
  type TagRuleMatchType,
  type CreateTransactionTagRuleInput,
  type UpdateTransactionTagRuleInput,
  type TagRuleListQuery,
  type TagRuleListResult,
  type TagRuleLedgerMatchStatus,
} from '../services/transaction-tag-rules.js';

export * as tagCoverageService from '../services/tag-coverage.js';

export type {
  TagCoverage,
  FacetCoverage,
  FacetExclusionReason,
  DescriptorGap,
  TagVocabularySnapshot,
  UnknownTagUsage,
} from '../services/tag-coverage.js';

export * as entityVenueDefaultsService from '../services/entity-venue-defaults.js';

export { isPerTransactionFacet, PER_TRANSACTION_FACETS } from '../services/entity-venue-facets.js';

export type {
  LiveEntityDefaults,
  EntityVenueEvidence,
  EntityDefaultTagsWrite,
  EntityVenueReview,
  EntityVenueOverride,
  EntityVenueReviewReason,
  EntityVenueDefaultsPlan,
  VenueCoverage,
} from '../services/entity-venue-defaults.js';
