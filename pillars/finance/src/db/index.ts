/**
 * Backend-safe barrel for the finance domain's persistence layer.
 *
 * Hosts finance-owned tables (transactions, budgets, wish list, tag rules,
 * tag vocabulary, corrections) and re-exports each table's service plus its
 * row/input types from a single entry point.
 */
export * from './errors.js';
export * from './tag-facets.js';
export * from './row-types.js';
export * from './schema.js';

export type { FinanceDb } from './services/internal.js';

export { openFinanceDb, type OpenedFinanceDb } from './open-finance-db.js';

export * as wishListService from './services/wishlist.js';

export {
  WISH_LIST_PRIORITIES,
  type WishListPriority,
  type WishListRow,
  type CreateWishListItemInput,
  type UpdateWishListItemInput,
  type WishListListResult,
  type WishListQuery,
} from './services/wishlist.js';

export * as tagVocabularyService from './services/tag-vocabulary.js';

export { type TagVocabularyRow, type TagVocabularySource } from './services/tag-vocabulary.js';

export * as tagRuleRejectionsService from './services/tag-rule-rejections.js';

export {
  type TagRuleRejection,
  type TagRuleRejectionRow,
  type RecordTagRuleRejectionInput,
} from './services/tag-rule-rejections.js';

export * as transactionTagRulesService from './services/transaction-tag-rules.js';

export {
  type TransactionTagRuleRow,
  type TagRuleMatchType,
  type CreateTransactionTagRuleInput,
  type UpdateTransactionTagRuleInput,
  type TagRuleListQuery,
  type TagRuleListResult,
} from './services/transaction-tag-rules.js';

export * as transactionsService from './services/transactions.js';

export {
  type CreateTransactionInput,
  type TransactionFilters,
  type TransactionListResult,
  type TransactionRow,
  type UpdateTransactionInput,
} from './services/transactions.js';

export * as transferPairsService from './services/transfer-pairs.js';

export type { PairTarget } from './services/transfer-pairs.js';

export * as importsService from './services/imports.js';

export type {
  EntityLookupEntry,
  EntityMaps,
  InsertImportTransactionInput,
  ImportTransactionRow,
} from './services/imports.js';

export * as budgetsService from './services/budgets.js';

export type {
  BudgetRow,
  BudgetWithSpend,
  BudgetListResult,
  CreateBudgetInput,
  UpdateBudgetInput,
  ListBudgetsOptions,
} from './services/budgets.js';

export * as currenciesService from './services/currencies.js';

export type {
  CurrencyRow,
  CreateCurrencyInput,
  UpdateCurrencyInput,
} from './services/currencies.js';

export * as accountsService from './services/accounts.js';

export type {
  AccountListResult,
  AccountReorderEntry,
  AccountRow,
  CreateAccountInput,
  CreateAccountOptions,
  ListAccountsOptions,
  UpdateAccountInput,
} from './services/accounts.js';

export {
  mergeAccounts,
  previewAccountMerge,
  type AccountMergePreview,
} from './services/merge-accounts.js';

export { balanceHistory, type BalancePoint } from './services/account-balance-history.js';

export { balanceAsOf, balancesFor } from './services/account-balance.js';

export {
  checkpointDelta,
  dayBefore,
  isAccountInconsistent,
  today,
  type AccountBalance,
  type BalanceAnchor,
  type BalanceBasis,
  type CheckpointDelta,
} from './services/account-balance-anchor.js';

export * as accountCheckpointsService from './services/account-checkpoints.js';

export type {
  AccountCheckpointRow,
  InsertCheckpointInput,
} from './services/account-checkpoints.js';

export { isCheckpointConflict } from './services/checkpoint-conflict.js';

export { resolveAccountIdByName, resolveImportAccountId } from './services/account-lookup.js';

export * as giftCardDetailsService from './services/gift-card-details.js';

export type {
  GiftCardDetailsRow,
  WriteGiftCardDetailsInput,
  RevealedGiftCardSecret,
  ExpiringGiftCard,
} from './services/gift-card-details.js';

export * as loanTermsService from './services/loan-terms.js';

export type {
  LoanTermsRow,
  LoanRateHistoryRow,
  WriteLoanTermsInput,
  RecordLoanRateInput,
} from './services/loan-terms.js';

export * as loanOffsetLinksService from './services/loan-offset-links.js';

export type { LoanOffsetLinkRow, LinkOffsetAccountInput } from './services/loan-offset-links.js';

export { resolvePendingPersonAccountEntity } from './services/account-entity-resolution.js';

export { resolveAccountEntityDisplays } from './services/account-entity-display.js';

export type { AccountEntityDisplay } from './services/account-entity-display.js';

export * as institutionsService from './services/institutions.js';

export type {
  InstitutionRow,
  CreateInstitutionInput,
  UpdateInstitutionInput,
} from './services/institutions.js';

export * as logoBlobsService from './services/logo-blobs.js';

export type { LogoBlobRow, CreateLogoBlobInput } from './services/logo-blobs.js';

export * as transactionCorrectionsService from './services/transaction-corrections.js';

export {
  type TransactionCorrectionRow,
  type TransactionCorrectionMatchType,
  type TransactionCorrectionTransactionType,
  type CreateTransactionCorrectionInput,
  type UpdateTransactionCorrectionInput,
  type TransactionCorrectionListResult,
  type TransactionCorrectionListQuery,
  type RuleMatchPreviewInput,
  type RuleMatchPreviewResult,
  type RuleMatchPreviewRow,
} from './services/transaction-corrections.js';

export * as crossPillarService from './services/cross-pillar.js';

export { listEntityUsage } from './services/entity-usage.js';

export type {
  EntityUsageRow,
  EntityUsageListResult,
  ListEntityUsageOptions,
} from './services/entity-usage.js';

export * as entityPrecreateOutboxService from './services/entity-precreate-outbox.js';

export {
  PENDING_CONTACT_ID_PREFIX,
  buildPendingContactId,
  isPendingContactId,
  type EntityPrecreateOutboxRow,
  type EnqueuePendingContactInput,
  type ReassignEntityIdCounts,
} from './services/entity-precreate-outbox.js';

export * as entityOrphansService from './services/entity-orphans.js';

export type {
  LiveEntityRef,
  DistinctEntityRef,
  EntityRepairPlan,
  OrphanRowCounts,
  EntityRepairResult,
} from './services/entity-orphans.js';

export * as tagCoverageService from './services/tag-coverage.js';

export type {
  TagCoverage,
  FacetCoverage,
  FacetExclusionReason,
  DescriptorGap,
  TagVocabularySnapshot,
  UnknownTagUsage,
} from './services/tag-coverage.js';

export * as entityVenueDefaultsService from './services/entity-venue-defaults.js';

export { isPerTransactionFacet, PER_TRANSACTION_FACETS } from './services/entity-venue-facets.js';

export type {
  LiveEntityDefaults,
  EntityVenueEvidence,
  EntityDefaultTagsWrite,
  EntityVenueReview,
  EntityVenueOverride,
  EntityVenueReviewReason,
  EntityVenueDefaultsPlan,
  VenueCoverage,
} from './services/entity-venue-defaults.js';

export * as importCommitsService from './services/import-commits.js';

export { searchFilterScope } from './services/search-filters.js';

export type {
  SearchFilter,
  FinanceSearchScope,
  TransactionsSearchScope,
  BudgetsSearchScope,
  WishlistSearchScope,
  SearchScopeResult,
} from './services/search-filters.js';
