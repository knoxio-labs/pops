/**
 * Registered failures for every Paperless-backed route, raw or contract.
 *
 * 412 for an unconfigured integration is load-bearing: consumers' soft-URI
 * crons (ADR-042) read only a 404 as "the document is gone", so neither
 * "not configured" nor an outage may ever look like one.
 */
import { defineErrors, PopsError } from '@pops/pillar-express';

import { getPaperlessClient } from './modules/paperless/index.js';
import { PaperlessApiError } from './modules/paperless/types.js';

import type { PaperlessClient } from './modules/paperless/client.js';

/** Registered paperless failures returned by both route surfaces. */
export const paperlessErrors = defineErrors('documents', {
  not_configured: {
    area: 'paperless',
    status: 412,
    message: 'Paperless-ngx is not configured.',
    retryable: false,
  },
  not_found: {
    area: 'paperless',
    status: 404,
    message: 'The requested Paperless document was not found.',
    retryable: false,
  },
  task_not_found: {
    area: 'paperless',
    status: 404,
    message: 'The requested Paperless task was not found.',
    retryable: false,
  },
  unavailable: {
    area: 'paperless',
    status: 503,
    message: 'Paperless-ngx could not be reached.',
    retryable: true,
  },
  upstream_failure: {
    area: 'paperless',
    status: 502,
    message: 'Paperless-ngx returned an unexpected response.',
    retryable: true,
  },
});

/** The configured client, or the registered 412. */
export function requirePaperlessClient(): PaperlessClient {
  return getPaperlessClient() ?? paperlessErrors.not_configured();
}

/**
 * Turn a failed Paperless call into its registered error. A Paperless 404
 * becomes `not_found` only when `notFoundId` names the document asked for;
 * everything else is an outage (503) or an upstream failure (502). Upstream
 * detail goes to the log, never into the response.
 */
export function throwPaperlessFailure(err: unknown, notFoundId?: number): never {
  if (err instanceof PopsError) throw err;
  if (err instanceof PaperlessApiError) {
    if (err.status === 404 && notFoundId !== undefined) {
      return paperlessErrors.not_found({ id: notFoundId });
    }
    console.warn(`[documents] Paperless call failed (status=${err.status}): ${err.message}`);
    if (err.status === 0) return paperlessErrors.unavailable();
    return paperlessErrors.upstream_failure({ upstreamStatus: err.status });
  }
  throw err;
}
