/**
 * Shared shape for a reporting pillar's per-caller ledger credential
 * (ADR-039 E22) and the log line it produces when a usage record does not
 * land in the ai pillar's ledger.
 *
 * Every reporting pillar (finance, cerebrum, food-worker, purchases) presents
 * the same kind of credential to the same endpoint and wants the same two
 * behaviours: read it file-first (ADR-039 E24), and when the ai pillar
 * refuses or never answers a record, say so with the env vars an operator
 * would go check — never the secret itself. That logic lived only in
 * purchases (POPS-1785); this is the one copy the other callers build their
 * own caller-specific wiring on top of, rather than re-typing it three times.
 */
import { readFileSync } from 'node:fs';

import { AiUsageRecordRefusedError } from './report-sink.js';

/** The two places one secret may be found. Their names are what a log says. */
export interface SecretSource {
  /** Variable naming a file that holds the value (production). */
  readonly fileEnvVar: string;
  /** Variable holding the value itself (local dev, tests). */
  readonly envVar: string;
  /** Environment to read; injectable for tests. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolve a secret, file source first.
 *
 * @param source Which variables to read.
 * @param logPrefix Tag for the warning logged when a configured file cannot
 *   be read (e.g. `'[finance]'`).
 * @returns The trimmed secret, or `undefined` when neither source yields a
 *   non-empty value.
 */
export function resolveSecret(source: SecretSource, logPrefix: string): string | undefined {
  const env = source.env ?? process.env;
  const fromFile = readSecretFile(env[source.fileEnvVar], source, logPrefix);
  if (fromFile !== undefined) return fromFile;
  const fromEnv = env[source.envVar]?.trim();
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}

function readSecretFile(
  rawPath: string | undefined,
  source: SecretSource,
  logPrefix: string
): string | undefined {
  // Trimmed before it is opened, not just before it is tested: a path with
  // stray whitespace from a `.env` edit or a templated compose file names a
  // file that does not exist, and the fallback would then authenticate as
  // whatever the environment variable happens to hold.
  const path = rawPath?.trim() ?? '';
  if (path === '') return undefined;
  let contents: string;
  try {
    contents = readFileSync(path, 'utf-8').trim();
  } catch (error) {
    console.warn(
      `${logPrefix} could not read ${source.fileEnvVar} (${path}): ` +
        `${error instanceof Error ? error.message : String(error)} — ` +
        `falling back to ${source.envVar}`
    );
    return undefined;
  }
  return contents === '' ? undefined : contents;
}

const DEFAULT_CREDENTIAL_ENV = 'POPS_INTERNAL_CREDENTIAL';
const DEFAULT_CREDENTIAL_FILE_ENV = 'POPS_INTERNAL_CREDENTIAL_FILE';
const DEFAULT_AI_BASE_URL_ENV = 'AI_API_URL';

/** One caller's ledger-credential identity: who it presents as, and where. */
export interface LedgerCredentialConfig {
  /** Ledger-side caller name; must match the ai pillar's accepted-caller row. */
  readonly callerName: string;
  /** Tag for this caller's log lines, e.g. `'[finance-api]'`. */
  readonly logPrefix: string;
  /** The env var the ai pillar reads this caller's half of the pair from. */
  readonly secretEnvVarAtAi: string;
  /** Defaults to `POPS_INTERNAL_CREDENTIAL`. */
  readonly credentialEnvVar?: string;
  /** Defaults to `POPS_INTERNAL_CREDENTIAL_FILE`. */
  readonly credentialFileEnvVar?: string;
  /** Defaults to `AI_API_URL`. */
  readonly aiBaseUrlEnv?: string;
}

/**
 * Resolve one caller's ledger credential, file source first.
 *
 * @param config Which caller and which env vars.
 * @param env Process environment to read; injectable for tests.
 * @returns The trimmed `name.secret` credential, or `undefined` when neither
 *   source yields a non-empty value — reporting then goes out unauthenticated
 *   and the ai pillar refuses it, which {@link ledgerReportFailedMessage}
 *   turns into a log line rather than a silent gap.
 */
export function resolveLedgerCredential(
  config: LedgerCredentialConfig,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return resolveSecret(
    {
      fileEnvVar: config.credentialFileEnvVar ?? DEFAULT_CREDENTIAL_FILE_ENV,
      envVar: config.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV,
      env,
    },
    config.logPrefix
  );
}

/**
 * The line logged when one caller's inference record does not reach the
 * ledger.
 *
 * Two failures reach here and they want different operators. A record the ai
 * pillar answered and refused is about the credential pairing, so the line
 * names both halves — either can be the missing one and they live in
 * different places. A record that never got an answer is a delivery failure:
 * the pairing may be perfectly fine, and sending someone after a secret
 * because ai-api was restarting wastes the one signal this log exists for.
 *
 * @param config Which caller this is, for the names in the message.
 * @param error What the sink reported: an `AiUsageRecordRefusedError` for a
 *   refusal, or whatever the transport threw.
 */
export function ledgerReportFailedMessage(config: LedgerCredentialConfig, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const credentialFileEnv = config.credentialFileEnvVar ?? DEFAULT_CREDENTIAL_FILE_ENV;
  const credentialEnv = config.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV;
  const aiBaseUrlEnv = config.aiBaseUrlEnv ?? DEFAULT_AI_BASE_URL_ENV;
  const preamble = `${config.logPrefix} AI usage was not recorded in the ai pillar's ledger: ${detail}. Fleet AI spend under-reports by this call. `;
  if (error instanceof AiUsageRecordRefusedError) {
    return (
      preamble +
      `The ai pillar refused the record, so check ${credentialFileEnv} or ` +
      `${credentialEnv} carries '${config.callerName}.<secret>', ` +
      `and that the ai pillar holds the matching ${config.secretEnvVarAtAi}.`
    );
  }
  return (
    preamble +
    `The record never reached the ai pillar, so this is delivery rather than the ` +
    `credential: check that ${aiBaseUrlEnv} points at a reachable ai pillar. If the ` +
    `line repeats once ai-api is up, the pairing is the next thing to check ` +
    `(${credentialFileEnv} or ${credentialEnv} here, ` +
    `${config.secretEnvVarAtAi} there).`
  );
}
