/**
 * Bridges the legacy `/items` and `/locations` routes onto the command
 * engine (POPS-4053): every write those routes make is one `runMutation`
 * call recorded with actor `web`, rather than a direct table write.
 */
import { randomUUID } from 'node:crypto';

import { runMutation } from '../../domain/commands/index.js';

import type { CommandActor, CommandDb, Mutation, Outcome } from '../../domain/commands/index.js';

const WEB_ACTOR: CommandActor = { kind: 'web' };

/** What a legacy route needs to run one command-layer mutation. */
export interface LegacyMutationRequest {
  readonly op: string;
  readonly entityId: string;
  readonly args: unknown;
  /**
   * The row's revision, read immediately before the call: the legacy routes
   * carry no revision of their own, and the engine's own transaction makes
   * that read-then-write atomic. `null` for a create.
   */
  readonly baseRevision?: number | null;
}

/**
 * Run one command-layer mutation on behalf of a legacy REST call, recorded
 * against actor `web`.
 */
export function runLegacyMutation(db: CommandDb, request: LegacyMutationRequest): Outcome {
  const mutation: Mutation = {
    mutationId: randomUUID(),
    op: request.op,
    entityId: request.entityId,
    baseRevision: request.baseRevision ?? null,
    dependsOn: [],
    clientTime: new Date().toISOString(),
    args: request.args,
  };
  return runMutation(db, mutation, WEB_ACTOR);
}
