import { defineErrors } from '@pops/pillar-express';

/** Stable errors for missing owned records and invalid route permutations. */
export const tripsErrors = defineErrors('trips', {
  not_found: {
    area: 'record',
    status: 404,
    message: 'The requested trip, place or visit was not found.',
    retryable: false,
  },
  order_invalid: {
    area: 'route',
    status: 400,
    message: 'Route order must contain every visit in this trip exactly once.',
    retryable: false,
  },
});
