import { defineErrors } from '@pops/pillar-express';

/** Registered import admission failures never authorize replay of an unknown AI attempt. */
export const bookingImportErrors = defineErrors('trips', {
  booking_import_conflict: {
    area: 'booking_import',
    status: 409,
    message:
      'Read the current source, accepted bindings and Capture revision before reviewing again.',
    retryable: false,
  },
  booking_import_mismatch: {
    area: 'booking_import',
    status: 409,
    message: 'This operation identifier already belongs to different import input.',
    retryable: false,
  },
  booking_import_invalid: {
    area: 'booking_import',
    status: 400,
    message: 'Select a verified original and explicit reviewed booking decisions.',
    retryable: false,
  },
  booking_import_unavailable: {
    area: 'booking_import',
    status: 503,
    message:
      'The original reader or privacy-admitted extraction adapter is unavailable. No extraction was started.',
    retryable: false,
  },
});
