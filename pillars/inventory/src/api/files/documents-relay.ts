/**
 * Relaying a documents-pillar answer from inventory's raw document routes.
 *
 * Documents states the upload limits and the Paperless failures once; these
 * routes pass its refusals back with documents' own code, message and
 * details, so a caller reads the same failure whichever pillar it asked.
 * Only statuses with a meaning documents defines are relayed; anything else
 * (a 404 from a documents build without the route, say) becomes a 502.
 */
import { PopsError } from '@pops/pillar-express';
import { ErrorBodySchema } from '@pops/types';

import { inventoryError } from '../errors.js';

/** A documents failure that means nothing more than documents could not be reached. */
export function documentsUnavailable(): PopsError {
  return inventoryError({
    area: 'documents',
    reason: 'unavailable',
    status: 503,
    message: 'The documents service could not be reached.',
    retryable: true,
  });
}

/** Documents answered, but not with anything this route understands. */
export function documentsUpstreamFailure(upstreamStatus: number): PopsError {
  return inventoryError({
    area: 'documents',
    reason: 'upstream_failure',
    status: 502,
    message: 'The documents service returned an unexpected response.',
    retryable: true,
    details: { upstreamStatus },
  });
}

/**
 * The error to answer with for a documents response with status `relayed`
 * among its statuses, keeping documents' envelope; any other status, or an
 * envelope that does not parse, is a 502.
 */
export async function relayDocumentsFailure(
  response: Response,
  relayed: ReadonlySet<number>
): Promise<PopsError> {
  if (!relayed.has(response.status)) return documentsUpstreamFailure(response.status);
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return documentsUpstreamFailure(response.status);
  }
  const body = ErrorBodySchema.safeParse(parsed);
  if (!body.success) return documentsUpstreamFailure(response.status);
  return new PopsError({
    code: body.data.code,
    status: response.status,
    message: body.data.message,
    retryable: body.data.retryable,
    details: body.data.details,
  });
}
