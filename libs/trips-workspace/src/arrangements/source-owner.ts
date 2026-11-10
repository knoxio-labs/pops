import { client as defaultClient } from '../trips-api/client.gen';

import type { Client } from '../trips-api/client';
import type { ArrangementsWorkspaceProps } from './types';

/** Exact source transport and trip captured independently of later mutable owner configuration. */
export interface SourceOwner {
  readonly client: Client;
  readonly origin: string;
  readonly tripId: number;
}
/** Resolve the actual generated default transport when the host does not supply an explicit one. */
export function sourceOwner(
  identity: Pick<ArrangementsWorkspaceProps, 'tripId' | 'client'>
): SourceOwner {
  const client = identity.client ?? defaultClient;
  return Object.freeze({
    client,
    origin: client.getConfig().baseUrl ?? '',
    tripId: identity.tripId,
  });
}
/** Compare exact transport identity, source origin and owning trip without inferring an authentication principal. */
export function sameSourceOwner(first: SourceOwner, second: SourceOwner): boolean {
  return (
    first.client === second.client &&
    first.origin === second.origin &&
    first.tripId === second.tripId
  );
}
/** Fence a retained operation against both the committed host and its transport's current mutable origin. */
export function currentSourceOwner(
  captured: SourceOwner,
  current: SourceOwner | undefined
): boolean {
  return (
    current !== undefined &&
    sameSourceOwner(current, captured) &&
    (captured.client.getConfig().baseUrl ?? '') === captured.origin
  );
}
