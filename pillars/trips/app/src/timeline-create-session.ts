import { z } from 'zod';

import { RetainedSessionStore, isSourceOwnerCurrent } from '@pops/trips-workspace';

import { client as defaultClient } from './trips-api/client.gen';
import {
  eventsCreate,
  journeysCreate,
  placesCreate,
  rentalsCreate,
  staysCreate,
  visitsCreate,
} from './trips-api/sdk.gen';

import type { QueryClient } from '@tanstack/react-query';

import type { OverviewSource, RetainedSourceOwner } from '@pops/trips-workspace';

import type { Client } from './trips-api/client';

/** Canonical sources with an explicit minimal create contract, plus reusable Places. */
export type TimelineCreateKind = 'visit' | 'journey' | 'stay' | 'event' | 'rental' | 'place';
/** A confirmed create identity; a Place selection never implicitly creates a Visit. */
export type TimelineCreatedSource = OverviewSource | { kind: 'place'; id: number };
/** Retained input and outcome; unknown and confirmed POSTs require explicit beginNew. */
export interface TimelineCreateSnapshot {
  kind: TimelineCreateKind;
  text: string;
  placeId: number | null;
  status: 'idle' | 'pending' | 'rejected' | 'unknown' | 'confirmed';
  error: unknown;
  created: TimelineCreatedSource | undefined;
}

const createdSource = z.object({ id: z.number().int().positive().safe(), tripId: z.number() });
const createdPlace = z.object({ id: z.number().int().positive().safe(), name: z.string() });
const sessions = new RetainedSessionStore<TimelineCreateSession>();

class CreateFailure extends Error {
  constructor(readonly uncertain: boolean) {
    super('The source creation could not be confirmed');
  }
}

/** Retain one create draft and POST outcome for the exact host scope, client, origin and Trip. */
export function timelineCreateSession(
  scope: QueryClient,
  identity: { tripId: number; client?: Client },
  kind: TimelineCreateKind
): TimelineCreateSession {
  return sessions.retain(
    scope,
    { ...identity, client: identity.client ?? defaultClient, kind, sourceId: 0 },
    (owner) => new TimelineCreateSession(owner, kind)
  ).session;
}

/** Serial non-idempotent creation; view closure never discards a dispatched request or its outcome. */
export class TimelineCreateSession {
  private state: TimelineCreateSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly owner: RetainedSourceOwner,
    kind: TimelineCreateKind
  ) {
    this.state = { kind, text: '', placeId: null, status: 'idle', error: null, created: undefined };
  }

  /** Subscribe to immutable snapshots, independent of mounted view lifetimes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read the same snapshot reference until a draft or outcome changes. */
  snapshot = (): TimelineCreateSnapshot => this.state;

  /** Test the original transport origin without rebinding retained input. */
  isCurrent = (): boolean => isSourceOwnerCurrent(this.owner);

  /** Edit only undispatched or definitively rejected input; preserve literal user text. */
  edit = (patch: { text?: string; placeId?: number | null }): void => {
    if (!this.isCurrent() || this.locked()) return;
    this.update({ ...patch, status: 'idle', error: null });
  };

  /** Explicitly acknowledge possible duplication before starting another source from a fresh draft. */
  beginNew = (): void => {
    if (!this.isCurrent() || this.state.status === 'pending') return;
    this.update({ text: '', placeId: null, status: 'idle', error: null, created: undefined });
  };

  /** Submit once; only a validated 201 acknowledgement returns an identity suitable for opening. */
  submit = async (): Promise<TimelineCreatedSource | undefined> => {
    if (this.locked()) return undefined;
    if (!this.isCurrent()) {
      this.update({ status: 'rejected', error: new CreateFailure(false) });
      return undefined;
    }
    const input = this.state;
    this.update({ status: 'pending', error: null });
    try {
      const created = await sendCreation(this.owner, input);
      if (!this.isCurrent()) throw new CreateFailure(true);
      this.update({ status: 'confirmed', created });
      const queryKey =
        created.kind === 'place'
          ? ['trips', this.owner.origin, 'places']
          : ['trips', this.owner.origin, this.owner.tripId];
      void this.owner.scope.invalidateQueries({ queryKey });
      return created;
    } catch (error) {
      const uncertain = !(error instanceof CreateFailure) || error.uncertain;
      this.update({ status: uncertain ? 'unknown' : 'rejected', error });
      return undefined;
    }
  };

  private locked(): boolean {
    return this.state.status !== 'idle' && this.state.status !== 'rejected';
  }

  private update(patch: Partial<TimelineCreateSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

async function sendCreation(
  owner: RetainedSourceOwner,
  input: TimelineCreateSnapshot
): Promise<TimelineCreatedSource> {
  const options = { client: owner.client, path: { tripId: owner.tripId } };
  const body = input.text === '' ? {} : { name: input.text };
  switch (input.kind) {
    case 'place':
      return createPlace(owner, input.text);
    case 'visit':
      return createVisit(owner, input.placeId);
    case 'journey':
      return ownedIdentity(
        acknowledge(await journeysCreate({ ...options, body })),
        owner,
        input.kind
      );
    case 'stay':
      return ownedIdentity(acknowledge(await staysCreate({ ...options, body })), owner, input.kind);
    case 'event':
      return ownedIdentity(
        acknowledge(await eventsCreate({ ...options, body })),
        owner,
        input.kind
      );
    case 'rental':
      return ownedIdentity(
        acknowledge(
          await rentalsCreate({
            ...options,
            body: input.text === '' ? {} : { provider: input.text },
          }),
          [400, 404, 409]
        ),
        owner,
        input.kind
      );
  }
}

function acknowledge(
  result: { data?: unknown; error?: unknown; response?: Response },
  rejected: readonly number[] = [400, 404]
): unknown {
  const status = result.response?.status;
  if (status !== 201) throw new CreateFailure(status === undefined || !rejected.includes(status));
  if (result.error !== undefined) throw new CreateFailure(true);
  return result.data;
}

function ownedIdentity(
  data: unknown,
  owner: RetainedSourceOwner,
  kind: Exclude<TimelineCreateKind, 'place'>
): TimelineCreatedSource {
  const source = createdSource.parse(data);
  if (source.tripId !== owner.tripId) throw new CreateFailure(true);
  return { kind, id: source.id };
}

async function createPlace(
  owner: RetainedSourceOwner,
  name: string
): Promise<TimelineCreatedSource> {
  if (name === '') throw new CreateFailure(false);
  const data = acknowledge(await placesCreate({ client: owner.client, body: { name } }), [400]);
  const place = createdPlace.parse(data);
  if (place.name !== name) throw new CreateFailure(true);
  return { kind: 'place', id: place.id };
}

async function createVisit(
  owner: RetainedSourceOwner,
  placeId: number | null
): Promise<TimelineCreatedSource> {
  if (placeId === null || !Number.isSafeInteger(placeId) || placeId <= 0)
    throw new CreateFailure(false);
  const data = acknowledge(
    await visitsCreate({ client: owner.client, path: { tripId: owner.tripId }, body: { placeId } })
  );
  const visit = z.object({ placeId: z.number() }).parse(data);
  if (visit.placeId !== placeId) throw new CreateFailure(true);
  return ownedIdentity(data, owner, 'visit');
}
