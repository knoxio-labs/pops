import { z } from 'zod';

import type { EventActorKind } from '../../db/index.js';

/**
 * One mutation as a client sends it. `mutationId` is the idempotency key and
 * is scoped globally, so it must be a UUID; `entityId` is only required to be
 * non-empty because rows that predate client-minted ids keep their old ids
 * (a create op validates the id it mints). `baseRevision` is the revision the
 * client last saw, absent for a create and for ops that do their own check.
 * `catalogueRevision` pins the immutable schema an offline client authored
 * against; older callers may omit it until they adopt protocol 2 values.
 * `dependsOn` names mutations that must have applied first. `clientTime` is
 * stored on the event as audit evidence and decides nothing. `args` is
 * validated by the op named in `op`.
 */
export const mutationSchema = z.object({
  mutationId: z.uuid(),
  op: z.string().min(1).max(64),
  entityId: z.string().min(1).max(128),
  baseRevision: z.number().int().min(1).nullish(),
  catalogueRevision: z.number().int().min(1).optional(),
  dependsOn: z.array(z.uuid()).max(50).default([]),
  clientTime: z.iso.datetime({ offset: true }),
  args: z.unknown(),
});
/** A parsed {@link mutationSchema}. */
export type Mutation = z.output<typeof mutationSchema>;

/**
 * Who a mutation is recorded against. A `device` is a phone behind bfm, with
 * bfm's device id and the label the owner gave it; `web` is browser traffic
 * through the shell; `service` is another pillar's service account by name.
 */
export type CommandActor =
  | { readonly kind: 'device'; readonly id: string; readonly label: string }
  | { readonly kind: 'web' }
  | { readonly kind: 'service'; readonly id: string };

/** An actor accepted by append-only history, including server migrations. */
export type EventActor =
  | CommandActor
  | { readonly kind: 'migration'; readonly id: string; readonly label: string };

/** The `events.actor_*` columns for an actor. */
export interface ActorColumns {
  actorKind: EventActorKind;
  actorId: string | null;
  actorLabel: string | null;
}

/** Map an actor onto the `events.actor_*` columns. */
export function actorColumns(actor: EventActor): ActorColumns {
  switch (actor.kind) {
    case 'device':
      return { actorKind: 'device', actorId: actor.id, actorLabel: actor.label };
    case 'service':
      return { actorKind: 'service', actorId: actor.id, actorLabel: null };
    case 'web':
      return { actorKind: 'web', actorId: null, actorLabel: null };
    case 'migration':
      return { actorKind: 'migration', actorId: actor.id, actorLabel: actor.label };
  }
}

/** The non-null `mutations.actor_id` an actor is indexed under. */
export function actorKey(actor: CommandActor): string {
  return actor.kind === 'web' ? 'web' : `${actor.kind}:${actor.id}`;
}
