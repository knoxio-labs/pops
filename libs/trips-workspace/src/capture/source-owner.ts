import { ApiError } from '@pops/pillar-sdk/client';

import { currentSourceOwner, sourceOwner } from '../arrangements/source-owner';

import type { CaptureIdentity, CapturePerformer } from './types';

/** Fence retained commands to their original semantic origin/trip while allowing replacement transports there. */
export class CaptureSourceOwner {
  private readonly original;
  constructor(identity: CaptureIdentity) {
    this.original = sourceOwner(identity);
  }
  /** Check the effective transport at dispatch, including exact retries and Undo, without changing their payloads. */
  bind(identity: CaptureIdentity, perform: CapturePerformer): CapturePerformer {
    return (request) => {
      const current = sourceOwner(identity);
      if (
        current.origin !== this.original.origin ||
        current.tripId !== this.original.tripId ||
        !currentSourceOwner(current, current)
      )
        throw new ApiError({
          code: 'trips.capture.context_invalid',
          kind: 'client',
          message: 'Restore the original Trips owner before retrying this operation.',
          retryable: true,
        });
      return perform(request);
    };
  }
}
