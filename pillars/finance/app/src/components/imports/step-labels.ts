import type { TFunction } from 'i18next';

import type { ImportDraftSource } from '../../store/import-store-types';

/**
 * The wizard's steps in order, as translation keys.
 *
 * The indicator used to render a parallel array of English literals while
 * every other string in the wizard resolved through `useTranslation`, so a
 * pt-BR session read "Upload, Map, Process, …" in the middle of an otherwise
 * translated page (POPS-3351). One list now, so the indicator and a
 * pending-import card cannot name the same step differently.
 */
export const IMPORT_STEP_KEYS = [
  'import.pending.step.upload',
  'import.pending.step.map',
  'import.pending.step.process',
  'import.pending.step.review',
  'import.pending.step.tags',
  'import.pending.step.rules',
  'import.pending.step.commit',
  'import.pending.step.summary',
] as const;

/** How many steps a full run has. What the numbering is derived from. */
export const IMPORT_STEP_COUNT = IMPORT_STEP_KEYS.length;

export function importStepLabel(step: number | null, t: TFunction<'finance'>): string | null {
  const key = step === null ? undefined : IMPORT_STEP_KEYS[step - 1];
  return key === undefined ? null : t(key);
}

/** The step numbers a run of this source has: a live draft has nothing to upload or map. */
export function importStepsFor(source: ImportDraftSource | null): number[] {
  const first = firstImportStep(source);
  return IMPORT_STEP_KEYS.map((_, index) => index + 1).filter((step) => step >= first);
}

/** Where Back stops: Process for a live draft, Upload otherwise. */
export function firstImportStep(source: ImportDraftSource | null): number {
  return source?.kind === 'live' ? 3 : 1;
}
