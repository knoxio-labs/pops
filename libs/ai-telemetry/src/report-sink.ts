import { type InferenceRecord } from './record-schema.js';

import type { ReportInferenceFn } from './types.js';

export interface ReportSinkConfig {
  /**
   * Base URL of the ai pillar. Defaults to `AI_API_URL` (checked FIRST so it
   * never collides with a service's self-pointing `POPS_API_URL`), then
   * `POPS_API_URL`. When neither resolves, reporting is a silent no-op.
   */
  baseUrl?: string;
  /**
   * Per-caller credential (`name.secret`, ADR-039 E22); defaults to
   * `POPS_INTERNAL_CREDENTIAL`. The ai pillar verifies it against the caller's
   * secret + scope.
   */
  credential?: string;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Opt-in diagnostics for a record that did not land: a thrown fetch, or a
   * response the ai pillar refused. Without it those are invisible, which is
   * how a caller can spend tokens for weeks without appearing in the ledger.
   */
  onError?: (error: unknown) => void;
}

const RECORD_PATH = '/ai-usage/record';

function resolveBaseUrl(explicit?: string): string | undefined {
  return explicit ?? process.env['AI_API_URL'] ?? process.env['POPS_API_URL'] ?? undefined;
}

/**
 * How the credential presented on a refused record should be described in a
 * log line. Three states, because they are three different mistakes: nothing
 * presented, something presented that is not `name.secret` (the bare secret
 * written where the whole credential belongs), and a well-formed credential
 * whose caller half is the useful part. Only that caller half is ever
 * echoed — a malformed value may be the secret itself.
 */
function credentialDescription(credential: string | undefined): string {
  if (credential === undefined || credential === '') {
    return 'no per-caller credential was presented';
  }
  const dot = credential.indexOf('.');
  if (dot <= 0) return "the credential presented is not in 'name.secret' form";
  return `presented as '${credential.slice(0, dot)}'`;
}

/**
 * A record the ai pillar answered and refused, as opposed to one that never
 * got there. Distinguishable by callers so an operator is sent after the
 * credential pairing only when the pillar actually rejected it.
 */
export class AiUsageRecordRefusedError extends Error {
  /** The status the ai pillar answered the record with. */
  readonly status: number;

  constructor(status: number, credential: string | undefined) {
    super(
      `ai-usage record refused with HTTP ${status} (${credentialDescription(credential)}) — the usage is not in the ledger`
    );
    this.name = 'AiUsageRecordRefusedError';
    this.status = status;
  }
}

/**
 * Builds an env-driven {@link ReportInferenceFn} that POSTs an
 * {@link InferenceRecord} to the ai pillar's internal `/ai-usage/record`
 * ingest. Best-effort by contract: nothing here alters a caller's control
 * flow. It is not silent, though — a refused or undelivered record goes to
 * {@link ReportSinkConfig.onError} when one is configured: a refusal as an
 * {@link AiUsageRecordRefusedError} naming the caller it was presented as, a
 * failed delivery as whatever the transport threw. Only an unconfigured sink
 * (no base URL) is a plain no-op, because that is the shape of dev and test
 * rather than of a failure.
 */
export function createEnvReportSink(config: ReportSinkConfig = {}): ReportInferenceFn {
  const fetchImpl = config.fetchImpl ?? fetch;
  return async (record: InferenceRecord): Promise<void> => {
    const baseUrl = resolveBaseUrl(config.baseUrl);
    if (!baseUrl) return;
    const credential = config.credential ?? process.env['POPS_INTERNAL_CREDENTIAL'];
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential) headers['x-pops-internal-credential'] = credential;
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    try {
      const response = await fetchImpl(`${base}${RECORD_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(record),
      });
      if (!response.ok)
        config.onError?.(new AiUsageRecordRefusedError(response.status, credential));
    } catch (error) {
      // Best-effort by contract: a transport failure must never propagate into
      // a caller. Surfaced only through the opt-in diagnostics hook.
      config.onError?.(error);
    }
  };
}

/** The default env-driven sink, resolved lazily from `process.env` per call. */
export const reportInference: ReportInferenceFn = (record) => createEnvReportSink()(record);
