/**
 * The settings keys the AI categorizer and the corrections rule-gen cluster
 * resolve at runtime (POPS-2589, POPS-3671). Declared apart from the manifest,
 * same pattern as `up-sync-keys.ts`, so the resolver can import just the
 * keys without pulling in the whole manifest tree.
 */
export const AI_CATEGORIZER_MODEL_KEY = 'finance.aiCategorizer.model';
export const AI_CATEGORIZER_MAX_TOKENS_KEY = 'finance.aiCategorizer.maxTokens';
export const AI_CATEGORIZER_PRE_ACCEPT_PERCENT_KEY =
  'finance.aiCategorizer.preAcceptConfidencePercent';
export const RULE_GEN_MODEL_KEY = 'finance.ruleGen.model';
export const RULE_GEN_MAX_TOKENS_KEY = 'finance.ruleGen.maxTokens';
