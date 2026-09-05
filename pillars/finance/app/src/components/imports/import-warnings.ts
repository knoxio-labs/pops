import type { ImportWarning } from '@pops/finance';

/** Banner title for an import warning type — `AI_CATEGORIZATION_UNAVAILABLE` means the categorizer is disabled by configuration. */
export function importWarningTitle(type: ImportWarning['type']): string {
  if (type === 'AI_CATEGORIZATION_UNAVAILABLE') return 'AI Categorization Disabled';
  if (type === 'AI_API_ERROR') return 'AI API Error';
  return 'Checkpoint Mismatch';
}

/** Blocking warnings pause the wizard at Processing behind a manual Continue; non-blocking ones auto-advance to Review. */
export function isBlockingImportWarning(warning: ImportWarning): boolean {
  return warning.type === 'AI_API_ERROR';
}

/**
 * Whether `affectedCount` means "N transactions could not be automatically
 * categorized" — true only for the AI warning types. `CHECKPOINT_MISMATCH`
 * also sets `affectedCount` (always 1, the checkpoint itself) but its own
 * `message`/`details` already say what disagreed, so the categorization copy
 * would be a non-sequitur under it (POPS-2882).
 */
export function describesUncategorizedTransactions(type: ImportWarning['type']): boolean {
  return type === 'AI_CATEGORIZATION_UNAVAILABLE' || type === 'AI_API_ERROR';
}
