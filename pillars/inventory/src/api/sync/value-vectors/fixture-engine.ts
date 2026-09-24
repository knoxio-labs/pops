/**
 * The command-engine writes the vector builders share, bound to one
 * `(db, nextId)` pair. `item.create` args carry every key the phone's encoder
 * sends, so a consumer can compare its own encoding against them exactly.
 */
import { eq } from 'drizzle-orm';

import { items, locations } from '../../../db/index.js';
import { runMutation } from '../../../domain/commands/engine.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { CommandActor, Mutation } from '../../../domain/commands/envelope.js';
import type { Outcome } from '../../../domain/commands/outcome.js';
import type { ValueVectorCatalogue } from './catalogue.js';

/** The clock every vector is generated at. */
export const VALUE_VECTOR_CLOCK = '2026-09-24T00:00:00.000Z';

const VECTOR_ACTOR: CommandActor = { kind: 'device', id: 'value-vector-fixture', label: 'Fixture' };

interface MutationSpec {
  readonly revision: number;
  readonly op: string;
  readonly entityId: string;
  readonly baseRevision: number | null;
  readonly args: unknown;
}

/** The `(db, nextId)` pair every engine call needs, bundled so call sites stay within max-params. */
interface EngineContext {
  readonly db: CommandDb;
  readonly nextId: () => string;
}

/** One `(db, nextId)`-bound set of fixture-writing operations. */
export interface FixtureEngine {
  readonly createItem: (
    catalogue: ValueVectorCatalogue,
    revision: number,
    name: string,
    values: readonly { readonly fieldId: string; readonly values: readonly unknown[] }[]
  ) => { readonly itemId: string; readonly command: Mutation };
  /** Runs an `item.create` the engine must refuse, and returns its rejection reason. */
  readonly rejectedCreate: (
    catalogue: ValueVectorCatalogue,
    values: readonly { readonly fieldId: string; readonly values: readonly unknown[] }[]
  ) => string;
  /** Removes one stored field's value with `item.edit`. */
  readonly clearField: (revision: number, itemId: string, fieldId: string) => Mutation;
  readonly deleteItem: (revision: number, itemId: string) => void;
  /** Removes an item's row outright — never a real command's job, only a maintenance path's. */
  readonly hardDeleteItem: (itemId: string) => void;
  readonly createLiveLocation: (name: string) => string;
  readonly deleteLocation: (revision: number, locationId: string) => void;
  readonly overrideComputedField: (
    revision: number,
    itemId: string,
    fieldId: string,
    values: readonly unknown[]
  ) => Mutation;
}

/** Builds one `Mutation`, minting its id from `nextId`. */
function buildMutation(nextId: () => string, spec: MutationSpec): Mutation {
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

function run(db: CommandDb, entry: Mutation): Outcome {
  return runMutation(db, entry, VECTOR_ACTOR, { now: () => VALUE_VECTOR_CLOCK });
}

function apply(db: CommandDb, entry: Mutation): void {
  const outcome = run(db, entry);
  if (outcome.status !== 'applied') {
    throw new Error(
      `value-vector fixture mutation ${entry.op} was rejected: ${JSON.stringify(outcome)}`
    );
  }
}

function itemRevision(db: CommandDb, itemId: string): number {
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

interface CreateItemSpec {
  readonly catalogue: ValueVectorCatalogue;
  readonly revision: number;
  readonly name: string;
  readonly values: readonly { readonly fieldId: string; readonly values: readonly unknown[] }[];
}

function createMutation(ctx: EngineContext, spec: CreateItemSpec): Mutation {
  return buildMutation(ctx.nextId, {
    revision: spec.revision,
    op: 'item.create',
    entityId: ctx.nextId(),
    baseRevision: null,
    args: {
      item: {
        name: spec.name,
        typeId: spec.catalogue.typeId,
        values: spec.values,
        note: null,
        externalIds: [],
        quantity: 1,
        placement: { kind: 'hand' },
      },
    },
  });
}

function engineCreateItem(
  ctx: EngineContext,
  spec: CreateItemSpec
): { readonly itemId: string; readonly command: Mutation } {
  const entry = createMutation(ctx, spec);
  apply(ctx.db, entry);
  return { itemId: entry.entityId, command: entry };
}

function engineRejectedCreate(ctx: EngineContext, spec: CreateItemSpec): string {
  const outcome = run(ctx.db, createMutation(ctx, spec));
  if (outcome.status !== 'rejected') {
    throw new Error(`the engine did not refuse a malformed value: ${JSON.stringify(outcome)}`);
  }
  return outcome.reason;
}

function engineClearField(
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

function engineDeleteItem(ctx: EngineContext, revision: number, itemId: string): void {
  const entry = buildMutation(ctx.nextId, {
    revision,
    op: 'item.delete',
    entityId: itemId,
    baseRevision: itemRevision(ctx.db, itemId),
    args: {},
  });
  apply(ctx.db, entry);
}

function engineCreateLiveLocation(ctx: EngineContext, name: string): string {
  const id = ctx.nextId();
  ctx.db.insert(locations).values({ id, name, lastEditedTime: VALUE_VECTOR_CLOCK }).run();
  return id;
}

function engineDeleteLocation(ctx: EngineContext, revision: number, locationId: string): void {
  const entry = buildMutation(ctx.nextId, {
    revision,
    op: 'location.delete',
    entityId: locationId,
    baseRevision: locationRevision(ctx.db, locationId),
    args: {},
  });
  apply(ctx.db, entry);
}

interface OverrideSpec {
  readonly revision: number;
  readonly itemId: string;
  readonly fieldId: string;
  readonly values: readonly unknown[];
}

function engineOverrideComputedField(ctx: EngineContext, spec: OverrideSpec): Mutation {
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

/** Builds one `(db, nextId)`-bound {@link FixtureEngine}. */
export function createFixtureEngine(db: CommandDb, nextId: () => string): FixtureEngine {
  const ctx: EngineContext = { db, nextId };
  return {
    createItem: (catalogue, revision, name, values) =>
      engineCreateItem(ctx, { catalogue, revision, name, values }),
    rejectedCreate: (catalogue, values) =>
      engineRejectedCreate(ctx, {
        catalogue,
        revision: catalogue.liveRevision,
        name: 'malformed value',
        values,
      }),
    clearField: (revision, itemId, fieldId) => engineClearField(ctx, { revision, itemId, fieldId }),
    deleteItem: (revision, itemId) => engineDeleteItem(ctx, revision, itemId),
    hardDeleteItem: (itemId) => {
      db.delete(items).where(eq(items.id, itemId)).run();
    },
    createLiveLocation: (name) => engineCreateLiveLocation(ctx, name),
    deleteLocation: (revision, locationId) => engineDeleteLocation(ctx, revision, locationId),
    overrideComputedField: (revision, itemId, fieldId, values) =>
      engineOverrideComputedField(ctx, { revision, itemId, fieldId, values }),
  };
}
