import { ApiError } from '@pops/pillar-sdk/client';

import { loadPlaces, loadVisits } from '../stay/api';
import { loadCaptureSource } from './api';
import { findCaptureSessionForOwner } from './browser-session';
import { sourceBelongsToTrip } from './result';
import { CaptureSourceOwner } from './source-owner';

import type { QueryClient } from '@tanstack/react-query';

import type { Place, Visit } from '../stay/types';
import type { CaptureIdentity, CaptureSource } from './types';

/** Source data and mutation generation proved against the semantic owner of its cache key. */
export interface CaptureWorkspaceRead {
  source: CaptureSource;
  generation: number;
  owner: { origin: string; tripId: number };
}

/** Optional catalogue data retains the same captured owner proof as its workspace. */
export interface CaptureCatalogueRead<T extends Place[] | Visit[]> {
  data: T;
  owner: CaptureWorkspaceRead['owner'];
}

function mismatchedRead(): ApiError {
  return new ApiError({
    code: 'trips.capture.response_invalid',
    kind: 'client',
    message: 'The cached source belongs to another Trips owner.',
    retryable: false,
  });
}

/** One view's immutable read/cache scope, independent of later mutable transport configuration. */
export class CaptureWorkspaceReadScope {
  readonly owner: CaptureSourceOwner;
  readonly key;
  readonly placesKey;
  readonly visitsKey;
  constructor(identity: CaptureIdentity) {
    this.owner = new CaptureSourceOwner(identity);
    const { origin, tripId } = this.owner.captured;
    this.key = ['trips', origin, tripId, 'capture_workspace'] as const;
    this.placesKey = [...this.key, 'places'] as const;
    this.visitsKey = [...this.key, 'visits'] as const;
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
    this.requireOwner(identity, read.owner);
    if (!sourceBelongsToTrip(read.source, this.owner.captured.tripId)) throw mismatchedRead();
    return read;
  }
  /** Read optional reusable places through the same owner fences as the source workspace. */
  loadPlaces(identity: CaptureIdentity): Promise<CaptureCatalogueRead<Place[]>> {
    return this.catalogue(identity, () => loadPlaces(identity.client));
  }
  /** Read only this captured trip's explicit Visit occurrences, without inferring route membership. */
  async loadVisits(identity: CaptureIdentity): Promise<CaptureCatalogueRead<Visit[]>> {
    const read = await this.catalogue(identity, () => loadVisits(identity.tripId, identity.client));
    this.selectVisits(identity, read);
    return read;
  }
  /** Validate cached place ownership before exposing options to an existing source editor. */
  selectPlaces(identity: CaptureIdentity, read: CaptureCatalogueRead<Place[]>): Place[] {
    this.requireOwner(identity, read.owner);
    return read.data;
  }
  /** Reject foreign owner or trip proof before exposing Visit options. */
  selectVisits(identity: CaptureIdentity, read: CaptureCatalogueRead<Visit[]>): Visit[] {
    this.requireOwner(identity, read.owner);
    if (read.data.some((visit) => visit.tripId !== this.owner.captured.tripId))
      throw mismatchedRead();
    return read.data;
  }
  private async catalogue<T extends Place[] | Visit[]>(
    identity: CaptureIdentity,
    load: () => Promise<T>
  ): Promise<CaptureCatalogueRead<T>> {
    this.owner.assert(identity);
    const data = await load();
    this.owner.assert(identity);
    const { origin, tripId } = this.owner.captured;
    return { data, owner: { origin, tripId } };
  }
  private requireOwner(identity: CaptureIdentity, owner: CaptureWorkspaceRead['owner']): void {
    this.owner.assert(identity);
    if (owner.origin !== this.owner.captured.origin || owner.tripId !== this.owner.captured.tripId)
      throw mismatchedRead();
  }
}
