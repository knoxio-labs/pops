import { TripCreationSession } from './create-trip-session';

import type { QueryClient } from '@tanstack/react-query';

import type { Client } from '../trips-api/client';

const sessions = new WeakMap<QueryClient, WeakMap<Client, Map<string, TripCreationSession>>>();

/** Retain creation by the existing metadata owner boundary, not a fabricated Trip ID or authenticated principal. */
export function retainTripCreation(scope: QueryClient, client: Client): TripCreationSession {
  let connections = sessions.get(scope);
  if (!connections) {
    connections = new WeakMap();
    sessions.set(scope, connections);
  }
  let origins = connections.get(client);
  if (!origins) {
    origins = new Map();
    connections.set(client, origins);
  }
  const origin = client.getConfig().baseUrl ?? '';
  let session = origins.get(origin);
  if (!session) {
    session = new TripCreationSession({ scope, client, origin });
    origins.set(origin, session);
  }
  return session;
}
