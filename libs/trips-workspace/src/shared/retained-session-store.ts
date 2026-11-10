import { ApiError } from '@pops/pillar-sdk/client';

import { client as defaultClient } from '../trips-api/client.gen';

import type { QueryClient } from '@tanstack/react-query';

import type { Client } from '../trips-api/client';

/** Explicit canonical source identity; the transport object and its current origin are separate boundaries. */
export interface RetainedSourceIdentity {
  readonly client?: Client;
  readonly tripId: number;
  readonly kind: string;
  readonly sourceId: number;
}

/** Immutable browser owner captured before any source command or cache acknowledgement. */
export interface RetainedSourceOwner {
  readonly scope: QueryClient;
  readonly client: Client;
  readonly origin: string;
  readonly tripId: number;
  readonly kind: string;
  readonly sourceId: number;
}

/** A typed controller and its original owner survive view remounts independently of query-cache eviction. */
export interface RetainedSession<Session> {
  readonly owner: RetainedSourceOwner;
  readonly session: Session;
}

/**
 * Retain one controller family for the host QueryClient lifetime. Different client objects never
 * share mutation proof, even at the same URL. Releasing the host scope releases its registry;
 * this browser lifetime is not an authenticated-principal boundary or durable storage.
 */
export class RetainedSessionStore<Session> {
  private readonly scopes = new WeakMap<
    QueryClient,
    WeakMap<Client, Map<string, RetainedSession<Session>>>
  >();

  /** Resolve only the exact captured client, origin, trip, source kind and source identity. */
  retain(
    scope: QueryClient,
    identity: RetainedSourceIdentity,
    create: (owner: RetainedSourceOwner) => Session
  ): RetainedSession<Session> {
    const client = identity.client ?? defaultClient;
    const origin = client.getConfig().baseUrl ?? '';
    let clients = this.scopes.get(scope);
    if (clients === undefined) {
      clients = new WeakMap();
      this.scopes.set(scope, clients);
    }
    let sessions = clients.get(client);
    if (sessions === undefined) {
      sessions = new Map();
      clients.set(client, sessions);
    }
    const key = JSON.stringify([origin, identity.tripId, identity.kind, identity.sourceId]);
    const retained = sessions.get(key);
    if (retained !== undefined) return retained;
    const owner = Object.freeze({
      scope,
      client,
      origin,
      tripId: identity.tripId,
      kind: identity.kind,
      sourceId: identity.sourceId,
    });
    const entry = Object.freeze({ owner, session: create(owner) });
    sessions.set(key, entry);
    return entry;
  }
}

/** Reject configuration changes before dispatch rather than rebinding an old draft or receipt. */
export function assertSourceOwner(owner: RetainedSourceOwner): void {
  if (!isSourceOwnerCurrent(owner)) throw sourceOwnerProblem();
}

/** Test the captured connection before admitting reads or mounting a controller from cached data. */
export function isSourceOwnerCurrent(owner: RetainedSourceOwner): boolean {
  return (owner.client.getConfig().baseUrl ?? '') === owner.origin;
}

/** Safe diagnostic for a source view whose transport no longer matches its captured connection. */
export function sourceOwnerProblem(): ApiError {
  return new ApiError({
    code: 'web.source.context_changed',
    kind: 'client',
    message: 'The source connection changed. Reopen the original source before retrying.',
    retryable: false,
  });
}

/** One mounted view's permission to start work; closing another view cannot deactivate this lease. */
export class SourceSessionView {
  private active = false;

  constructor(readonly owner: RetainedSourceOwner) {}

  /** Activate only after the view commits. */
  activate(): void {
    this.active = true;
  }

  /** Unmount releases this view without discarding the controller or an already dispatched request. */
  deactivate(): void {
    this.active = false;
  }

  /** Stale callbacks cannot start another operation after this view unmounts. */
  isActive(): boolean {
    return this.active;
  }

  /** Ignore reads or draft callbacks when their committed view or captured transport is no longer current. */
  isCurrent = (): boolean => this.active && isSourceOwnerCurrent(this.owner);

  /** Recheck after asynchronous preparation and immediately before any request dispatch. */
  assertCurrent(): void {
    assertSourceOwner(this.owner);
    if (!this.active)
      throw new ApiError({
        code: 'web.source.view_closed',
        kind: 'client',
        message: 'The source editor closed before this request was sent.',
        retryable: false,
      });
  }
}
