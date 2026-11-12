import { RetainedSessionStore, useRetainedSession } from '@pops/trips-workspace';

import { client as defaultTripClient } from '../trips-api/client.gen';
import { MetadataSession } from './metadata-session';

import type { RetainedSourceOwner } from '@pops/trips-workspace';

import type { ApiClients } from '../api/types';
import type { Trip } from '../api/types';

/** An unopened read can find an existing editor without creating or fabricating a canonical source. */
export class MetadataEntry {
  private editor: MetadataSession | undefined;
  /** The last confirmed source remains available independently of any query cache. */
  get session(): MetadataSession | undefined {
    return this.editor;
  }
  /** Initialize once from the owning source; remount input never replaces retained state. */
  ensure(owner: RetainedSourceOwner, initial: Trip): MetadataSession {
    this.editor ??= new MetadataSession(owner, initial);
    return this.editor;
  }
}
const sessions = new RetainedSessionStore<MetadataEntry>();

/** Resolve the actual app transport explicitly; optional Tags capability never changes the metadata owner. */
export function metadataIdentity(tripId: number, clients: ApiClients) {
  return {
    client: clients.tripClient ?? defaultTripClient,
    tripId,
    kind: 'trip-metadata',
    sourceId: tripId,
  };
}
/** Query-cache eviction does not release the owning host's weakly retained metadata session. */
export function useMetadataEntry(tripId: number, clients: ApiClients) {
  return useRetainedSession(sessions, metadataIdentity(tripId, clients), () => new MetadataEntry());
}
