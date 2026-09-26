/**
 * The command-engine writes the vector builders share, bound to one
 * `(db, nextId)` pair. `item.create` args carry every key the phone's encoder
 * sends, so a consumer can compare its own encoding against them exactly.
 */
import { eq } from 'drizzle-orm';

import { items } from '../../../db/index.js';
import {
  apply,
  buildMutation,
  engineClearField,
  engineCreateLiveLocation,
  engineDeleteItem,
  engineDeleteLocation,
  engineOverrideComputedField,
  engineRenameItem,
  run,
} from './fixture-engine-writes.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { Mutation } from '../../../domain/commands/envelope.js';
import type { ValueVectorCatalogue } from './catalogue.js';
import type { EngineContext } from './fixture-engine-writes.js';

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
  /** Renames a live item with `item.edit`, leaving its values untouched. */
  readonly renameItem: (revision: number, itemId: string, name: string) => Mutation;
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
    renameItem: (revision, itemId, name) => engineRenameItem(ctx, revision, itemId, name),
    hardDeleteItem: (itemId) => {
      db.delete(items).where(eq(items.id, itemId)).run();
    },
    createLiveLocation: (name) => engineCreateLiveLocation(ctx, name),
    deleteLocation: (revision, locationId) => engineDeleteLocation(ctx, revision, locationId),
    overrideComputedField: (revision, itemId, fieldId, values) =>
      engineOverrideComputedField(ctx, { revision, itemId, fieldId, values }),
  };
}
