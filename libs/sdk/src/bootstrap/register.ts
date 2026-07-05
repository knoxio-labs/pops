import {
  errSummary,
  PillarRegistrationCancelledError,
  PillarRegistrationRejectedError,
} from './errors.js';
import {
  RegistryTransportError,
  type CapabilityStatuses,
  type RegistrationResult,
  type RegistryTransport,
} from './transport.js';

import type { ManifestPayload } from '../manifest-schema/schema.js';
import type { BootstrapLogger } from './logger.js';

export interface RegisterWithRetryArgs {
  transport: RegistryTransport;
  manifest: ManifestPayload;
  baseUrl: string;
  capabilities?: CapabilityStatuses;
  logger: BootstrapLogger;
  initialBackoffMs: number;
  maxBackoffMs: number;
  setTimeoutImpl: typeof setTimeout;
  /**
   * Resolves when the caller wants the retry loop abandoned promptly (e.g.
   * `stop()` firing mid-backoff during shutdown). Rejects the loop with
   * {@link PillarRegistrationCancelledError} instead of waiting out the
   * remaining backoff.
   */
  cancelSignal: Promise<void>;
}

/**
 * Registers with the registry, retrying retriable failures (network errors,
 * 5xx) forever with capped exponential backoff. A registry that is briefly
 * unavailable at boot must not stop the pillar from eventually joining the
 * fleet, so this never gives up on a transient failure — only a
 * non-retriable rejection (a genuine 4xx; retrying can't fix a bad manifest)
 * or `cancelSignal` ends the loop.
 */
export async function registerWithRetry(args: RegisterWithRetryArgs): Promise<RegistrationResult> {
  let attempt = 0;

  for (;;) {
    attempt += 1;
    try {
      const result = await args.transport.register({
        pillarId: args.manifest.pillar,
        baseUrl: args.baseUrl,
        manifest: args.manifest,
        ...(args.capabilities ? { capabilities: args.capabilities } : {}),
      });
      args.logger.info('[pillar-sdk] registered with registry', {
        pillar: result.pillarId,
        attempt,
      });
      return result;
    } catch (err) {
      if (err instanceof RegistryTransportError && !err.retriable) {
        throw new PillarRegistrationRejectedError(err.status, err.issues ?? []);
      }
      const backoff = Math.min(args.initialBackoffMs * 2 ** (attempt - 1), args.maxBackoffMs);
      args.logger.warn('[pillar-sdk] registration attempt failed, retrying', {
        pillar: args.manifest.pillar,
        attempt,
        nextDelayMs: backoff,
        err: errSummary(err),
      });
      const outcome = await sleepOrCancel(backoff, args.setTimeoutImpl, args.cancelSignal);
      if (outcome === 'cancelled') throw new PillarRegistrationCancelledError();
    }
  }
}

function sleep(ms: number, setTimeoutImpl: typeof setTimeout): Promise<void> {
  return new Promise((resolve) => {
    setTimeoutImpl(resolve, ms);
  });
}

function sleepOrCancel(
  ms: number,
  setTimeoutImpl: typeof setTimeout,
  cancelSignal: Promise<void>
): Promise<'elapsed' | 'cancelled'> {
  return Promise.race([
    sleep(ms, setTimeoutImpl).then((): 'elapsed' => 'elapsed'),
    cancelSignal.then((): 'cancelled' => 'cancelled'),
  ]);
}
