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
  /** Opt-in diagnostics for a swallowed transport failure. */
  onError?: (error: unknown) => void;
}

const RECORD_PATH = '/ai-usage/record';

function resolveBaseUrl(explicit?: string): string | undefined {
  return explicit ?? process.env['AI_API_URL'] ?? process.env['POPS_API_URL'] ?? undefined;
}

/**
 * Builds an env-driven {@link ReportInferenceFn} that POSTs an
 * {@link InferenceRecord} to the ai pillar's internal `/ai-usage/record`
 * ingest. Best-effort by contract: a missing sink, a non-2xx response, or a
 * thrown fetch are all swallowed so telemetry can never break a caller.
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
      await fetchImpl(`${base}${RECORD_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(record),
      });
    } catch (error) {
      // Best-effort by contract: a transport failure must never propagate into
      // a caller. Surfaced only through the opt-in diagnostics hook.
      config.onError?.(error);
    }
  };
}

/** The default env-driven sink, resolved lazily from `process.env` per call. */
export const reportInference: ReportInferenceFn = (record) => createEnvReportSink()(record);
