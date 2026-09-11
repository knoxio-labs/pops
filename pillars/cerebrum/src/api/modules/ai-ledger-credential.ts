/**
 * The credential cerebrum presents to the ai pillar's usage ledger, and the
 * line it logs when a call's usage fails to land there.
 *
 * Distinct from cerebrum's other internal-auth secrets: this is the
 * per-caller `name.secret` of ADR-039 E22, which the ai pillar verifies
 * against `POPS_INTERNAL_SECRET_CEREBRUM` and the `ai.usage.record` scope
 * before it will write a row. Without it a call's tokens are spent and never
 * accounted for, so fleet AI spend under-reports by exactly cerebrum's share
 * — see POPS-2332.
 *
 * This is cerebrum's caller identity wired onto the generic logic in
 * `@pops/ai-telemetry` (the shape purchases' equivalent module used before
 * POPS-2332 extracted it, POPS-1785).
 */
import {
  ledgerReportFailedMessage as sharedLedgerReportFailedMessage,
  resolveLedgerCredential as sharedResolveLedgerCredential,
  type LedgerCredentialConfig,
} from '@pops/ai-telemetry';

/** Ledger-side caller name. Must match the ai pillar's accepted-caller row. */
export const CEREBRUM_LEDGER_CALLER_NAME = 'cerebrum';

/** The whole `name.secret` credential inline; what the deploy delivers. */
export const LEDGER_CREDENTIAL_ENV = 'POPS_INTERNAL_CREDENTIAL';

/** A path to a file holding that credential; preferred when both are set. */
export const LEDGER_CREDENTIAL_FILE_ENV = 'POPS_INTERNAL_CREDENTIAL_FILE';

/** The env var the ai pillar reads cerebrum's half of the pair from. */
export const LEDGER_SECRET_ENV_AT_AI = 'POPS_INTERNAL_SECRET_CEREBRUM';

/** Where both the pricing reads and the usage sink find the ai pillar. */
export const AI_BASE_URL_ENV = 'AI_API_URL';

const CONFIG: LedgerCredentialConfig = {
  callerName: CEREBRUM_LEDGER_CALLER_NAME,
  logPrefix: '[cerebrum-api]',
  secretEnvVarAtAi: LEDGER_SECRET_ENV_AT_AI,
};

/**
 * Resolve the ledger credential, file source first.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns The trimmed `name.secret` credential, or `undefined` when neither
 *   source yields a non-empty value.
 */
export function resolveLedgerCredential(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return sharedResolveLedgerCredential(CONFIG, env);
}

/**
 * The line logged when one inference record does not reach the ledger.
 *
 * @param error What the sink reported: an `AiUsageRecordRefusedError` for a
 *   refusal, or whatever the transport threw.
 */
export function ledgerReportFailedMessage(error: unknown): string {
  return sharedLedgerReportFailedMessage(CONFIG, error);
}
