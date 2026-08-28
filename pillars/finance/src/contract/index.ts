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
  isValidRegexPattern,
  normalizePatternForStorage,
  patternMatchesNormalizedDescription,
  regexPatternExpectsDigits,
  type PatternMatchType,
} from './pattern-match.js';
export { type ChangeSet, type ChangeSetOp } from './rest-corrections-schemas.js';
export {
  parseAnzDescription,
  type AnzDescription,
  type AnzForeignCharge,
} from './anz-description.js';
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
  type SuggestedTag,
  type MatchedRule,
} from './rest-imports-schemas.js';
export { type TagRuleChangeSet, type TagRuleImpactItem } from './rest-tag-rules.js';
