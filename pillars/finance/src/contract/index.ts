export * from './types/index.js';
export * from './errors.js';
export type { FinanceRouter } from './router.js';
export type { FinanceContract } from './manifest.js';

// Browser-consumable corrections surface, shared with the app so the
// optimistic import-merge has a single implementation.
export {
  applyChangeSetToRules,
  correctionToRow,
  toCorrection,
  normalizeDescription,
  HIGH_CONFIDENCE_THRESHOLD,
  type Correction,
  type CorrectionRow,
} from './corrections-pure.js';
export {
  describeForMatching,
  isValidRegexPattern,
  normalizePatternForStorage,
  patternMatchesDescription,
  type MatchableDescription,
  type PatternMatchType,
} from './pattern-match.js';
export {
  classifyFromDescription,
  hasGiftCardTag,
  resolveCommittedType,
  FEE_PATTERNS,
  FEE_TAGS,
  FEE_TAG_PREFIX,
  INBOUND_TRANSFER_PATTERNS,
  GIFT_CARD_TAG,
  type DerivedClassification,
  type FeeTag,
} from './transaction-classification.js';
export {
  isSpendType,
  SPEND_TRANSACTION_TYPES,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_STAT_TILE,
  type TransactionType,
} from './corrections-constants.js';
export { PENDING_CONTACT_ID_PREFIX, isPendingContactId } from './entity-id.js';
export { type ChangeSet, type ChangeSetOp } from './rest-corrections-schemas.js';
export {
  parseAnzDescription,
  type AnzDescription,
  type AnzForeignCharge,
} from './anz-description.js';
export { anzPdfStatementLineDescription } from './anz-statement-line.js';
export {
  parseAnzPdfStatementText,
  planAnzPdfImport,
  type AnzPdfStatement,
  type AnzPdfStatementOptions,
  type AnzPdfImportPlan,
  type DateInterval,
  type ImportRefusal,
  type WithheldReason,
  type WithheldTransaction,
} from './anz-pdf-statement.js';
export { parseAmexRow, type AmexRowFields } from './amex-row.js';
export { FX_CAPTURE_SOURCES, type FxCaptureSource } from './fx-capture.js';
export { CURRENCY_KINDS, type CurrencyKind } from './currency-kind.js';
export {
  ACCOUNT_KINDS,
  DAY_ONE_ACCOUNT_KINDS,
  ACCOUNT_KIND_BEHAVIOURS,
  getAccountKindBehaviour,
  type AccountKind,
  type AccountKindBehaviour,
} from './account-kind.js';
export {
  LOAN_RATE_SOURCES,
  LOAN_TERMS_SOURCES,
  type LoanRateSource,
  type LoanTermsSource,
} from './loan.js';
export { CHECKPOINT_SOURCES, type CheckpointSource } from './checkpoint.js';
export {
  CommitBatchSchema,
  IMPORT_PROVIDERS,
  IMPORT_SOURCE_KINDS,
  ImportSourceSchema,
  isImportProvider,
  type CommitBatch,
  type ImportProvider,
  type ImportSource,
  type ImportSourceKind,
} from './import-source.js';
export {
  ImportBatchSchema,
  ImportConfigSchema,
  ImportStatusSchema,
  WriteImportConfigBodySchema,
  type ImportBatch,
  type ImportConfig,
  type ImportStatus,
  type WriteImportConfigBody,
} from './rest-account-imports-schemas.js';
export {
  centsToDollars,
  centsToDollarsNullable,
  dollarsToCents,
  dollarsToCentsNullable,
} from '../money.js';
export { formatBalance, type CurrencyFormat } from './format-balance.js';
export {
  buildImportDedupKey,
  buildImportDedupKeyFromStoredRow,
  extractReferenceValue,
  findReferenceHeader,
  type ImportDedupFields,
} from './import-dedup.js';
export {
  type ParsedTransaction,
  type ProcessedTransaction,
  type ConfirmedTransaction,
  type ImportWarning,
  type ProcessImportOutput,
  type CommitResult,
  type CommitTagRuleChangeSet,
  type SuggestedTag,
  type MatchedRule,
} from './rest-imports-schemas.js';
export { type TagRuleChangeSet, type TagRuleImpactItem } from './rest-tag-rules.js';
