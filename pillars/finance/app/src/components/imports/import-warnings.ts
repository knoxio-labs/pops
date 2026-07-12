import type { ImportWarning } from '@pops/finance';

/** Banner title for an import warning type — `AI_CATEGORIZATION_UNAVAILABLE` means the categorizer is disabled by configuration. */
export function importWarningTitle(type: ImportWarning['type']): string {
  return type === 'AI_CATEGORIZATION_UNAVAILABLE' ? 'AI Categorization Disabled' : 'AI API Error';
}

/** Blocking warnings pause the wizard at Processing behind a manual Continue; non-blocking ones auto-advance to Review. */
export function isBlockingImportWarning(warning: ImportWarning): boolean {
  return warning.type === 'AI_API_ERROR';
}
