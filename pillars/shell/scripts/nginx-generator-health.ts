/**
 * Health and Prometheus metrics for the event-driven nginx reloader.
 * Validation failures remain visible immediately, while the health endpoint
 * becomes unhealthy after the configured consecutive failure threshold.
 *
 * State model:
 *   - On every successful regen + validate + reload, the last error clears
 *     and the last-success timestamp advances.
 *   - On any stage failure, the last error records its stage, message and
 *     time until the next successful cycle.
 *   - Validation failures below the threshold report retrying; other failures
 *     and threshold-reaching validation failures report degraded.
 *   - The JSON health surface reports the last error in epoch milliseconds.
 *     The Prometheus exposition reports its timestamp in seconds.
 *
 * The HTTP server serves JSON health and Prometheus text on separate GET
 * endpoints. It has no framework dependency.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { ReloadErrorEvent, ReloadStage } from './nginx-event-reload.js';

/** Current watcher state consumed by health checks and Prometheus scrapes. */
export interface NginxGeneratorHealthSnapshot {
  readonly status: 'ok' | 'retrying' | 'degraded';
  readonly lastSuccessAt: number | null;
  readonly lastError: {
    readonly stage: ReloadStage;
    readonly message: string;
    readonly at: number;
  } | null;
  readonly nginx_generator_last_error_at: number | null;
  readonly consecutiveValidationFailures: number;
  readonly validationFailureThreshold: number;
}

/** Mutable state interface used by the watcher and its health endpoint. */
export interface NginxGeneratorHealth {
  readonly snapshot: () => NginxGeneratorHealthSnapshot;
  readonly recordSuccess: (at?: Date) => void;
  readonly recordError: (event: ReloadErrorEvent) => void;
}

interface HealthState {
  lastSuccessAt: number | null;
  lastError: NginxGeneratorHealthSnapshot['lastError'];
  consecutiveValidationFailures: number;
}

function healthStatus(
  state: HealthState,
  validationFailureThreshold: number
): NginxGeneratorHealthSnapshot['status'] {
  if (state.lastError === null) return 'ok';
  if (
    state.lastError.stage === 'validate' &&
    state.consecutiveValidationFailures < validationFailureThreshold
  ) {
    return 'retrying';
  }
  return 'degraded';
}

/**
 * Creates watcher health state. Repeated validation failures become unhealthy
 * at the supplied threshold; a successful reload clears the failure state.
 */
export function createNginxGeneratorHealth(validationFailureThreshold = 1): NginxGeneratorHealth {
  if (!Number.isSafeInteger(validationFailureThreshold) || validationFailureThreshold < 1) {
    throw new RangeError('validationFailureThreshold must be a positive safe integer');
  }

  const state: HealthState = {
    lastSuccessAt: null,
    lastError: null,
    consecutiveValidationFailures: 0,
  };
  return {
    snapshot: () => ({
      status: healthStatus(state, validationFailureThreshold),
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
      nginx_generator_last_error_at: state.lastError?.at ?? null,
      consecutiveValidationFailures: state.consecutiveValidationFailures,
      validationFailureThreshold,
    }),
    recordSuccess: (at?: Date) => {
      state.lastSuccessAt = (at ?? new Date()).getTime();
      state.lastError = null;
      state.consecutiveValidationFailures = 0;
    },
    recordError: (event: ReloadErrorEvent) => {
      state.consecutiveValidationFailures =
        event.stage === 'validate' ? state.consecutiveValidationFailures + 1 : 0;
      state.lastError = {
        stage: event.stage,
        message: event.message,
        at: event.at.getTime(),
      };
    },
  };
}

/** HTTP server handle returned by the health endpoint. */
export interface HealthEndpointHandle {
  readonly port: number;
  readonly close: () => Promise<void>;
}

/** Configuration for the health and Prometheus endpoints. */
export interface StartHealthEndpointOptions {
  readonly health: NginxGeneratorHealth;
  readonly port: number;
  readonly host?: string;
  readonly path?: string;
  readonly metricsPath?: string;
}

const DEFAULT_HEALTH_PATH = '/health';
const DEFAULT_METRICS_PATH = '/metrics';

function handleHealthRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: Pick<StartHealthEndpointOptions, 'health' | 'path' | 'metricsPath'>
): void {
  const url = req.url ?? '/';
  const pathname = url.split('?')[0] ?? '/';
  const path = options.path ?? DEFAULT_HEALTH_PATH;
  const metricsPath = options.metricsPath ?? DEFAULT_METRICS_PATH;
  if (req.method !== 'GET') {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  const snapshot = options.health.snapshot();
  if (pathname === metricsPath) {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(
      [
        '# HELP nginx_generator_last_error_at Unix timestamp in seconds of the most recent failed reload cycle; 0 after recovery.',
        '# TYPE nginx_generator_last_error_at gauge',
        `nginx_generator_last_error_at ${
          snapshot.nginx_generator_last_error_at === null
            ? 0
            : Math.floor(snapshot.nginx_generator_last_error_at / 1000)
        }`,
        '# HELP nginx_generator_consecutive_validation_failures Consecutive nginx configuration validation failures.',
        '# TYPE nginx_generator_consecutive_validation_failures gauge',
        `nginx_generator_consecutive_validation_failures ${snapshot.consecutiveValidationFailures}`,
        '',
      ].join('\n')
    );
    return;
  }
  if (pathname !== path) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  res.statusCode = snapshot.status === 'degraded' ? 503 : 200;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(snapshot));
}

/** Starts the local HTTP health and Prometheus metrics endpoints. */
export async function startHealthEndpoint(
  options: StartHealthEndpointOptions
): Promise<HealthEndpointHandle> {
  const server: Server = createServer((req, res) => {
    handleHealthRequest(req, res, options);
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening);
      rejectPromise(err);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(options.port, options.host ?? '0.0.0.0');
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  return {
    port,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => {
          if (err !== undefined && err !== null) rejectClose(err);
          else resolveClose();
        });
      }),
  };
}
