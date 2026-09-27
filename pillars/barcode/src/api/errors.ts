import { defineErrors } from '@pops/pillar-express';

import type { ErrorBody } from '@pops/types';

const BARCODE_ERROR_DEFINITIONS = {
  invalid_code: {
    area: 'lookup',
    status: 400,
    message: 'The supplied barcode is invalid.',
    retryable: false,
  },
  provider_unavailable: {
    area: 'lookup',
    status: 503,
    message: 'Barcode lookup is temporarily unavailable.',
    retryable: true,
  },
  timeout: {
    area: 'lookup',
    status: 504,
    message: 'Barcode lookup timed out.',
    retryable: true,
  },
} as const;

/** Registered barcode failures for HTTP boundaries that throw. */
export const barcodeErrors = defineErrors('barcode', BARCODE_ERROR_DEFINITIONS);

/** Build a registered barcode failure for an unavailable 200 lookup outcome. */
export function barcodeErrorBody(
  reason: 'provider_unavailable' | 'timeout',
  requestId: string
): ErrorBody {
  const definition = BARCODE_ERROR_DEFINITIONS[reason];
  return {
    code: `barcode.${definition.area}.${reason}`,
    message: definition.message,
    requestId,
    retryable: definition.retryable,
  };
}
