import { expect, it } from 'vitest';

import { tripsErrors } from '../errors.js';

it.each(['leg_revision_conflict', 'leg_order_conflict', 'leg_removal_conflict'] as const)(
  'publishes the registered lowercase code and non-retryable conflict metadata for %s',
  (reason) => {
    expect(() => tripsErrors[reason]()).toThrow(
      expect.objectContaining({
        code: `trips.journey_leg.${reason}`,
        status: 409,
        retryable: false,
      })
    );
  }
);
