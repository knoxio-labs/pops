import { z } from 'zod';

import type { CheckpointsListResponses } from '../../finance-api/index.js';

export type Checkpoint = CheckpointsListResponses[200]['data'][number];

/** Today as `YYYY-MM-DD`, matching the wire's `asOf` shape. */
export const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Whether a checkpoint disagreed with what the ledger predicted for it.
 * `deltaCents` is `null` only for the earliest checkpoint (nothing to
 * compare it against, ADR-051) — every other one carries a real delta, which
 * is zero for an ordinary agreeing checkpoint, so `null` and `0` both read
 * as "no disagreement" but for different reasons.
 */
export function isInconsistent(checkpoint: Pick<Checkpoint, 'deltaCents'>): boolean {
  return checkpoint.deltaCents !== null && checkpoint.deltaCents !== 0;
}

/**
 * Form values for the "Add checkpoint" dialog. `amount` stays a string (a
 * text input, not a number) so an in-progress value like `""` or `"-"` never
 * makes the input controlled-then-uncontrolled; `useAccountCheckpointsActions`
 * parses and signs it on submit.
 */
export const CheckpointFormSchema = z.object({
  amount: z
    .string()
    .min(1, 'Balance is required')
    .refine((v) => Number.isFinite(Number(v)), 'Balance must be a valid number'),
  asOf: z
    .string()
    .min(1, 'Date is required')
    .refine((v) => v <= today(), 'Date cannot be in the future'),
  note: z.string(),
});

export type CheckpointFormValues = z.infer<typeof CheckpointFormSchema>;

export const DEFAULT_CHECKPOINT_FORM_VALUES: CheckpointFormValues = {
  amount: '',
  asOf: today(),
  note: '',
};
