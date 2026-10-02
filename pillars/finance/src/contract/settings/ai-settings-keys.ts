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

export const FINANCE_AI_MODEL_DEFAULT = 'claude-haiku-4-5-20251001';

/** The models the two model settings offer; a stored value outside this list is ignored by the resolver. */
export const FINANCE_AI_MODEL_OPTIONS = [
  { value: FINANCE_AI_MODEL_DEFAULT, label: 'Claude Haiku 4.5' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
] as const;
