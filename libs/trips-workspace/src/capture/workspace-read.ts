import { ApiError } from '@pops/pillar-sdk/client';

import { loadCaptureSource } from './api';
import { findCaptureSessionForOwner } from './browser-session';
import { sourceBelongsToTrip } from './result';
import { CaptureSourceOwner } from './source-owner';

import type { QueryClient } from '@tanstack/react-query';

import type { CaptureIdentity, CaptureSource } from './types';

/** Source data and mutation generation proved against the semantic owner of its cache key. */
export interface CaptureWorkspaceRead {
  source: CaptureSource;
  generation: number;
  owner: { origin: string; tripId: number };
}

/** One view's immutable read/cache scope, independent of later mutable transport configuration. */
export class CaptureWorkspaceReadScope {
  readonly owner: CaptureSourceOwner;
  readonly key;
  constructor(identity: CaptureIdentity) {
    this.owner = new CaptureSourceOwner(identity);
    const { origin, tripId } = this.owner.captured;
    this.key = ['trips', origin, tripId, 'capture_workspace'] as const;
  }
  /** Fence both request dispatch and response delivery before admitting a source into this cache. */
  async load(
    cache: QueryClient,
    identity: CaptureIdentity,
    signal?: AbortSignal
  ): Promise<CaptureWorkspaceRead> {
    this.owner.assert(identity);
    const generation =
      findCaptureSessionForOwner(cache, this.owner.captured)?.editor.getState().generation ?? 0;
    const source = await loadCaptureSource(identity, signal);
    const { origin, tripId } = this.owner.captured;
    return this.select(identity, { source, generation, owner: { origin, tripId } });
  }
  /** Reject foreign cache proof before passing source data to the retained editor. */
  select(identity: CaptureIdentity, read: CaptureWorkspaceRead): CaptureWorkspaceRead {
    this.owner.assert(identity);
    if (
      read.owner.origin !== this.owner.captured.origin ||
      read.owner.tripId !== this.owner.captured.tripId ||
      !sourceBelongsToTrip(read.source, this.owner.captured.tripId)
    )
      throw new ApiError({
        code: 'trips.capture.response_invalid',
        kind: 'client',
        message: 'The cached source belongs to another Trips owner.',
        retryable: false,
      });
    return read;
  }
}
