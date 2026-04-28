import { trpcError } from '../../../shared/trpc-error.js';
import * as arrService from './service.js';
import { ArrApiError } from './types.js';

import type { RadarrClient } from './radarr-client.js';
import type { SonarrClient } from './sonarr-client.js';

const MASKED_KEY = '••••••••';

export { MASKED_KEY };

/**
 * Resolve the API key from a form value, falling back to saved settings if masked.
 */
export function resolveArrApiKey(formKey: string, service: 'radarr' | 'sonarr'): string | null {
  if (formKey !== MASKED_KEY) return formKey;
  const s = arrService.getArrSettings();
  return (service === 'radarr' ? s.radarrApiKey : s.sonarrApiKey) ?? null;
}

/** Convert any error to a human readable message. */
export function describeArrError(err: unknown): string {
  if (err instanceof ArrApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Wrap an arr API call so {@link ArrApiError}s become TRPC INTERNAL_SERVER_ERRORs
 * and 'Sonarr not configured'/'Radarr not configured' become PRECONDITION_FAILED.
 */
export async function withArrErrorHandling<T>(service: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ArrApiError) {
      throw trpcError(
        'INTERNAL_SERVER_ERROR',
        'media.arr.apiError',
        {
          service,
          detail: err.message,
        },
        err
      );
    }
    if (err instanceof Error && err.message === `${service} not configured`) {
      throw trpcError('PRECONDITION_FAILED', 'media.arr.serviceNotConfigured', { service });
    }
    throw err;
  }
}

/** Require a configured Radarr client, throwing PRECONDITION_FAILED otherwise. */
export function requireRadarrClient(): RadarrClient {
  const client = arrService.getRadarrClient();
  if (!client) {
    throw trpcError('PRECONDITION_FAILED', 'media.arr.radarrNotConfigured');
  }
  return client;
}

/** Require a configured Sonarr client, throwing PRECONDITION_FAILED otherwise. */
export function requireSonarrClient(): SonarrClient {
  const client = arrService.getSonarrClient();
  if (!client) {
    throw trpcError('PRECONDITION_FAILED', 'media.arr.sonarrNotConfigured');
  }
  return client;
}
