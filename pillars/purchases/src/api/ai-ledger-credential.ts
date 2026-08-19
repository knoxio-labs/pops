/**
 * The credential this pillar presents to the ai pillar's usage ledger, and
 * the line it logs when a receipt's usage fails to land there.
 *
 * Distinct from the service-account key in `./pillars/service-account.ts`:
 * that one is an `X-API-Key` this pillar sends to siblings' contract
 * surfaces, while this is the per-caller `name.secret` of ADR-039 E22, which
 * the ai pillar verifies against `POPS_INTERNAL_SECRET_PURCHASES` and the
 * `ai.usage.record` scope before it will write a row. Every AI-calling pillar
 * in the ledger holds one; without it a receipt's tokens are spent and never
 * accounted for, so fleet AI spend under-reports by exactly this pillar's
 * share.
 *
 * The file source is preferred over the environment one for the same reason
 * the other two secrets here prefer it (ADR-039 E24) — a mounted file keeps a
 * credential out of the process environment and out of `docker inspect` — but
 * the deploy hands this one over inline, in the per-caller internal-auth env
 * file every reporting pillar receives. Both sources are read so the pillar
 * does not care which arrangement it lands in.
 */
import { AiUsageRecordRefusedError } from '@pops/ai-telemetry';

import { resolveSecret } from './secret-source.js';

/** Ledger-side caller name. Must match the ai pillar's accepted-caller row. */
export const PURCHASES_LEDGER_CALLER_NAME = 'purchases';

/** The whole `name.secret` credential inline; what the deploy delivers. */
export const LEDGER_CREDENTIAL_ENV = 'POPS_INTERNAL_CREDENTIAL';

/** A path to a file holding that credential; preferred when both are set. */
export const LEDGER_CREDENTIAL_FILE_ENV = 'POPS_INTERNAL_CREDENTIAL_FILE';

/** The env var the ai pillar reads this caller's half of the pair from. */
export const LEDGER_SECRET_ENV_AT_AI = 'POPS_INTERNAL_SECRET_PURCHASES';

/** Where both the pricing reads and the usage sink find the ai pillar. */
export const AI_BASE_URL_ENV = 'AI_API_URL';

/**
 * Resolve the ledger credential, file source first.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns The trimmed `name.secret` credential, or `undefined` when neither
 *   source yields a non-empty value — reporting then goes out unauthenticated
 *   and the ai pillar refuses it, which {@link ledgerReportFailedMessage}
 *   turns into a log line rather than a silent gap.
 */
export function resolveLedgerCredential(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return resolveSecret({
    fileEnvVar: LEDGER_CREDENTIAL_FILE_ENV,
    envVar: LEDGER_CREDENTIAL_ENV,
    env,
  });
}

/**
 * The line logged when one inference record does not reach the ledger.
 *
 * Two failures reach here and they want different operators. A record the ai
 * pillar answered and refused is about the credential pairing, so the line
 * names both halves — either can be the missing one and they live in
 * different places. A record that never got an answer is a delivery failure:
 * the pairing may be perfectly fine, and sending someone after a secret
 * because ai-api was restarting wastes the one signal this log exists for.
 *
 * @param error What the sink reported: an `AiUsageRecordRefusedError` for a
 *   refusal, or whatever the transport threw.
 */
export function ledgerReportFailedMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const preamble = `[purchases-api] AI usage was not recorded in the ai pillar's ledger: ${detail}. Fleet AI spend under-reports by this call. `;
  if (error instanceof AiUsageRecordRefusedError) {
    return (
      preamble +
      `The ai pillar refused the record, so check ${LEDGER_CREDENTIAL_FILE_ENV} or ` +
      `${LEDGER_CREDENTIAL_ENV} carries '${PURCHASES_LEDGER_CALLER_NAME}.<secret>', ` +
      `and that the ai pillar holds the matching ${LEDGER_SECRET_ENV_AT_AI}.`
    );
  }
  return (
    preamble +
    `The record never reached the ai pillar, so this is delivery rather than the ` +
    `credential: check that ${AI_BASE_URL_ENV} points at a reachable ai pillar. If the ` +
    `line repeats once ai-api is up, the pairing is the next thing to check ` +
    `(${LEDGER_CREDENTIAL_FILE_ENV} or ${LEDGER_CREDENTIAL_ENV} here, ` +
    `${LEDGER_SECRET_ENV_AT_AI} there).`
  );
}
