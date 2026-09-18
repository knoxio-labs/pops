/**
 * Command vectors (Inventory ADR-002 D11): one fixture per registered op, run
 * against the real engine with a fixed clock, actor and set of ids so the
 * output is byte-stable across regenerations. `scripts/generate-command-vectors.ts`
 * serialises {@link buildCommandVectors}' output to
 * `contracts/command-vectors-v1.json`; `__tests__/command-vectors.test.ts`
 * regenerates it in-process and asserts nothing drifted. B3 vendors the file
 * to iOS and replays every vector through the Swift reducer, so a vector's
 * `outcome` is the ground truth that reducer is pinned to.
 */
import { openMigratedMemoryDb } from '../../db/open-migrated-memory-db.js';
import { COMMAND_VECTOR_CASES } from './command-vector-cases.js';
import {
  seedFixture,
  VECTOR_CLOCK,
  type CommandVectorCase,
  type SeedItem,
  type SeedLocation,
} from './command-vector-fixture.js';
import { runMutation } from './engine.js';

import type { CommandActor, Mutation } from './envelope.js';
import type { Outcome } from './outcome.js';

export { COMMAND_VECTOR_CASES } from './command-vector-cases.js';
export type { CommandVectorCase, SeedItem, SeedLocation } from './command-vector-fixture.js';

/** The actor every vector's mutation runs as. */
export const VECTOR_ACTOR: CommandActor = {
  kind: 'device',
  id: 'device-fixture',
  label: 'Fixture',
};

/** A generated vector: the case's seed and mutation, plus the engine's actual outcome. */
export interface CommandVector {
  readonly name: string;
  readonly op: string;
  readonly seedLocations: readonly SeedLocation[];
  readonly seedItems: readonly SeedItem[];
  readonly mutation: Mutation;
  readonly actor: CommandActor;
  readonly outcome: Outcome;
}

/** Run one case's `pre` mutations, then its recorded mutation, and collect the vector the latter produced. */
function runCase(vectorCase: CommandVectorCase): CommandVector {
  const { db } = openMigratedMemoryDb();
  seedFixture(db, vectorCase);
  for (const pre of vectorCase.pre ?? []) {
    runMutation(db, { ...pre, clientTime: VECTOR_CLOCK }, VECTOR_ACTOR, {
      now: () => VECTOR_CLOCK,
    });
  }
  const mutation: Mutation = { ...vectorCase.mutation, clientTime: VECTOR_CLOCK };
  const outcome = runMutation(db, mutation, VECTOR_ACTOR, { now: () => VECTOR_CLOCK });
  return {
    name: vectorCase.name,
    op: vectorCase.op,
    seedLocations: vectorCase.seedLocations ?? [],
    seedItems: vectorCase.seedItems ?? [],
    mutation,
    actor: VECTOR_ACTOR,
    outcome,
  };
}

/** Run every {@link COMMAND_VECTOR_CASES} case against a fresh migrated database and collect its outcome. */
export function buildCommandVectors(): CommandVector[] {
  return COMMAND_VECTOR_CASES.map(runCase);
}
