import { defineErrors } from '@pops/pillar-express';

/** Stable errors for missing owned records and invalid route permutations. */
export const tripsErrors = defineErrors('trips', {
  not_found: {
    area: 'record',
    status: 404,
    message: 'The requested trip, place, visit, journey or leg was not found.',
    retryable: false,
  },
  order_invalid: {
    area: 'route',
    status: 400,
    message:
      'Order must contain every existing member of the selected route or journey exactly once.',
    retryable: false,
  },
});
