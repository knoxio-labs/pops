import { defineErrors } from '@pops/pillar-express';

/** Stable errors for missing owned records and invalid route permutations. */
export const tripsErrors = defineErrors('trips', {
  revision_conflict: {
    area: 'group',
    status: 409,
    message:
      'This journey group changed. Read its latest revision before changing selection or membership.',
    retryable: false,
  },
  journey_grouped: {
    area: 'group',
    status: 409,
    message: 'Remove this journey’s group memberships before deleting its source records.',
    retryable: false,
  },
  not_found: {
    area: 'record',
    status: 404,
    message: 'The requested owned record or journey group was not found.',
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
