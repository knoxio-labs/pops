/**
 * Whether `Apply ChangeSet` is available in the correction-proposal dialog.
 *
 * Its own module so the rule is asserted where it lives. Restating the
 * expression in a test file passes no matter what the hook does, which is how
 * the process-session gate below survived being written down.
 *
 * Deliberately **no process-session check** (POPS-3358). Applying builds the
 * ChangeSet from the local ops and hands it to the import store: no server
 * call, no session. A live Up draft never has a process session, because its
 * rows arrive pre-mapped from the webhook or the sync and skip the Process
 * step, so gating on one left the button impossible to enable for every live
 * import.
 */
export interface CanApplyInput {
  isBusy: boolean;
  opsCount: number;
  hasDirty: boolean;
  previewError: string | null;
}

export function deriveCanApply(input: CanApplyInput): boolean {
  return !input.isBusy && input.opsCount > 0 && !input.hasDirty && !input.previewError;
}
