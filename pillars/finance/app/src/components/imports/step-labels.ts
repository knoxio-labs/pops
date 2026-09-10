import type { TFunction } from 'i18next';

/** The wizard's steps by number, shared by the step indicator and the pending-import cards. */
export const IMPORT_STEP_LABELS = [
  'Upload',
  'Map',
  'Process',
  'Review',
  'Tags',
  'Rules',
  'Commit',
  'Summary',
] as const;

/** {@link IMPORT_STEP_LABELS}, keyed for translation (the pending-import card's own text). */
const IMPORT_STEP_KEYS = [
  'import.pending.step.upload',
  'import.pending.step.map',
  'import.pending.step.process',
  'import.pending.step.review',
  'import.pending.step.tags',
  'import.pending.step.rules',
  'import.pending.step.commit',
  'import.pending.step.summary',
] as const;

export function importStepLabel(step: number | null, t: TFunction<'finance'>): string | null {
  const key = step === null ? undefined : IMPORT_STEP_KEYS[step - 1];
  return key === undefined ? null : t(key);
}
