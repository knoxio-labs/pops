/**
 * The mutation-shaped writes {@link createFixtureEngine} exposes beyond
 * `item.create`: edits, deletes and overrides, each run through the real
 * command engine so a fixture can only reach a state the engine itself
 * accepts.
 */
import { eq } from 'drizzle-orm';

import { items, locations } from '../../../db/index.js';
import { runMutation } from '../../../domain/commands/engine.js';
import { VALUE_VECTOR_CLOCK } from './deterministic-ids.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { CommandActor, Mutation } from '../../../domain/commands/envelope.js';
import type { Outcome } from '../../../domain/commands/outcome.js';

export const VECTOR_ACTOR: CommandActor = {
  kind: 'device',
  id: 'value-vector-fixture',
  label: 'Fixture',
};

export interface MutationSpec {
  readonly revision: number;
  readonly op: string;
  readonly entityId: string;
  readonly baseRevision: number | null;
  readonly args: unknown;
}

/** The `(db, nextId)` pair every engine call needs, bundled so call sites stay within max-params. */
export interface EngineContext {
  readonly db: CommandDb;
  readonly nextId: () => string;
}

/** Builds one `Mutation`, minting its id from `nextId`. */
export function buildMutation(nextId: () => string, spec: MutationSpec): Mutation {
  return {
    mutationId: nextId(),
    op: spec.op,
    entityId: spec.entityId,
    baseRevision: spec.baseRevision,
    dependsOn: [],
    clientTime: VALUE_VECTOR_CLOCK,
    catalogueRevision: spec.revision,
    args: spec.args,
  };
}

export function run(db: CommandDb, entry: Mutation): Outcome {
  return runMutation(db, entry, VECTOR_ACTOR, { now: () => VALUE_VECTOR_CLOCK });
}

export function apply(db: CommandDb, entry: Mutation): void {
  const outcome = run(db, entry);
  if (outcome.status !== 'applied') {
    throw new Error(
      `value-vector fixture mutation ${entry.op} was rejected: ${JSON.stringify(outcome)}`
    );
  }
}

export function itemRevision(db: CommandDb, itemId: string): number {
  const row = db.select({ revision: items.revision }).from(items).where(eq(items.id, itemId)).get();
  if (!row) throw new Error(`cannot find item ${itemId}`);
  return row.revision;
}

function locationRevision(db: CommandDb, locationId: string): number {
  const row = db
    .select({ revision: locations.revision })
    .from(locations)
    .where(eq(locations.id, locationId))
    .get();
  if (!row) throw new Error(`cannot find location ${locationId} to delete`);
  return row.revision;
}

export function engineClearField(
  ctx: EngineContext,
  spec: { readonly revision: number; readonly itemId: string; readonly fieldId: string }
): Mutation {
  const entry = buildMutation(ctx.nextId, {
    revision: spec.revision,
    op: 'item.edit',
    entityId: spec.itemId,
    baseRevision: itemRevision(ctx.db, spec.itemId),
    args: { values: [{ fieldId: spec.fieldId, values: null }] },
  });
  apply(ctx.db, entry);
  return entry;
}

/** Renames a live item with `item.edit`, leaving its values untouched. */
export function engineRenameItem(
  ctx: EngineContext,
  revision: number,
  itemId: string,
  name: string
): Mutation {
  const entry = buildMutation(ctx.nextId, {
    revision,
    op: 'item.edit',
    entityId: itemId,
    baseRevision: itemRevision(ctx.db, itemId),
    args: { name },
  });
  apply(ctx.db, entry);
  return entry;
}

export function engineDeleteItem(ctx: EngineContext, revision: number, itemId: string): void {
  const entry = buildMutation(ctx.nextId, {
    revision,
    op: 'item.delete',
    entityId: itemId,
    baseRevision: itemRevision(ctx.db, itemId),
    args: {},
  });
  apply(ctx.db, entry);
}

export function engineCreateLiveLocation(ctx: EngineContext, name: string): string {
  const id = ctx.nextId();
  ctx.db.insert(locations).values({ id, name, lastEditedTime: VALUE_VECTOR_CLOCK }).run();
  return id;
}

export function engineDeleteLocation(
  ctx: EngineContext,
  revision: number,
  locationId: string
): void {
  const entry = buildMutation(ctx.nextId, {
    revision,
    op: 'location.delete',
    entityId: locationId,
    baseRevision: locationRevision(ctx.db, locationId),
    args: {},
  });
  apply(ctx.db, entry);
}

export interface OverrideSpec {
  readonly revision: number;
  readonly itemId: string;
  readonly fieldId: string;
  readonly values: readonly unknown[];
}

export function engineOverrideComputedField(ctx: EngineContext, spec: OverrideSpec): Mutation {
  const entry = buildMutation(ctx.nextId, {
    revision: spec.revision,
    op: 'item.setOverride',
    entityId: spec.itemId,
    baseRevision: itemRevision(ctx.db, spec.itemId),
    args: { fieldId: spec.fieldId, values: spec.values },
  });
  apply(ctx.db, entry);
  return entry;
}
