import { ApiError } from '@pops/pillar-sdk/client';

import { currentSourceOwner, sourceOwner } from '../arrangements/source-owner';

import type { SourceOwner } from '../arrangements/source-owner';
import type { CaptureIdentity, CapturePerformer } from './types';

/** Fence retained commands to their original semantic origin/trip while allowing replacement transports there. */
export class CaptureSourceOwner {
  /** Immutable semantic owner captured before reads or commands can be dispatched. */
  readonly captured: SourceOwner;
  constructor(identity: CaptureIdentity) {
    this.captured = sourceOwner(identity);
  }
  /** Reject an effective origin/trip change while retaining the original semantic scope. */
  assert(identity: CaptureIdentity): void {
    const current = sourceOwner(identity);
    if (
      current.origin !== this.captured.origin ||
      current.tripId !== this.captured.tripId ||
      !currentSourceOwner(current, current)
    )
      throw new ApiError({
        code: 'trips.capture.context_invalid',
        kind: 'client',
        message: 'Restore the original Trips owner before retrying this operation.',
        retryable: true,
      });
  }
  /** Check the effective transport at dispatch, including exact retries and Undo, without changing their payloads. */
  bind(identity: CaptureIdentity, perform: CapturePerformer): CapturePerformer {
    return (request) => {
      this.assert(identity);
      return perform(request);
    };
  }
}
