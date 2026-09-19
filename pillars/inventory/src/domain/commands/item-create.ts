import { z } from 'zod';

import { items } from '../../db/index.js';
import { findType, typeFieldsSchema } from '../../types/index.js';
import { CommandRejected } from './errors.js';
import { externalIdsSchema, itemFieldsBlobSchema, placementSchema } from './item-fields.js';
import { defineOp } from './op.js';
import { assertPlacementAllowed } from './placement.js';
import { upsertSearchIndex } from './search-index.js';

import type { TypeDefinition } from '../../types/index.js';
import type { WriteStamp } from './entities.js';
import type { CommandDb } from './entities.js';

const createArgs = z.object({
  item: z.object({
    name: z.string().trim().min(1),
    typeKey: z.string().min(1).nullish(),
    fields: itemFieldsBlobSchema.default({}),
    note: z.string().trim().min(1).nullish(),
    externalIds: externalIdsSchema.default([]),
    quantity: z.number().int().min(1).default(1),
    placement: placementSchema.default({ kind: 'hand' }),
  }),
});

type CreateItemInput = z.infer<typeof createArgs>['item'];

/** The item's type, or `undefined` for an untyped item; `type_unknown` for a `typeKey` the catalogue does not have. */
function resolveType(typeKey: string | null | undefined): TypeDefinition | undefined {
  if (!typeKey) return undefined;
  const type = findType(typeKey);
  if (!type) throw new CommandRejected('type_unknown', `unknown type ${typeKey}`);
  return type;
}

/** Validate `fields` against `type` (or, untyped, require it empty: there is no schema to check it against). */
function assertFieldsFitType(
  type: TypeDefinition | undefined,
  fields: Record<string, unknown>
): void {
  if (type) {
    if (!typeFieldsSchema(type).safeParse(fields).success) {
      throw new CommandRejected('invalid', `fields do not fit type ${type.key}`);
    }
    return;
  }
  if (Object.keys(fields).length > 0) {
    throw new CommandRejected('invalid', 'an untyped item cannot carry fields');
  }
}

interface InsertItemArgs {
  readonly db: CommandDb;
  readonly id: string;
  readonly item: CreateItemInput;
  readonly isContainer: boolean;
  readonly stamp: WriteStamp;
}

/** Insert the new item's row at `id`, with the placement and containment its type already validated. */
function insertItem({ db, id, item, isContainer, stamp }: InsertItemArgs): void {
  db.insert(items)
    .values({
      id,
      name: item.name,
      typeKey: item.typeKey ?? null,
      fields: JSON.stringify(item.fields),
      note: item.note ?? null,
      externalIds: JSON.stringify(item.externalIds),
      quantity: item.quantity,
      placementKind: item.placement.kind,
      locationId: item.placement.kind === 'location' ? item.placement.locationId : null,
      containingItemId: item.placement.kind === 'container' ? item.placement.itemId : null,
      isContainer: isContainer ? 1 : 0,
      access: isContainer ? 'open' : null,
      lastEditedTime: stamp.now,
      revision: stamp.revision,
      seq: stamp.seq,
      createdAt: stamp.now,
      updatedAt: stamp.now,
    })
    .run();
}

/**
 * `item.create { item }`: mint a new item at the id the client already
 * chose (`entityId`, validated as a UUID here since new ids are exactly what
 * D6 requires clients to mint). `typeKey` absent leaves the item untyped, in
 * which case `fields` must be empty: there is no schema to validate it
 * against. `is_container`, `access` and `is_full` are never taken from the
 * client; they follow from the type's `containment` capability (ADR-002 D1).
 */
export const itemCreate = defineOp({
  op: 'item.create',
  mode: 'create',
  entity: 'item',
  args: createArgs,
  plan(ctx, args) {
    if (!z.uuid().safeParse(ctx.mutation.entityId).success) {
      throw new CommandRejected('invalid', 'item.create needs a UUID entityId');
    }
    const { item } = args;
    const type = resolveType(item.typeKey);
    assertFieldsFitType(type, item.fields);
    assertPlacementAllowed(ctx.db, ctx.mutation.entityId, item.placement);
    const isContainer = type?.capabilities.includes('containment') ?? false;

    return {
      eventKind: 'created',
      changes: {
        name: item.name,
        typeKey: item.typeKey ?? null,
        fields: item.fields,
        note: item.note ?? null,
        externalIds: item.externalIds,
        quantity: item.quantity,
        placement: item.placement,
        isContainer,
      },
      insert: (db, stamp) =>
        insertItem({ db, id: ctx.mutation.entityId, item, isContainer, stamp }),
      effects(effectCtx) {
        upsertSearchIndex(effectCtx.db, {
          id: ctx.mutation.entityId,
          name: item.name,
          code: null,
          note: item.note ?? null,
          typeKey: item.typeKey ?? null,
          fields: JSON.stringify(item.fields),
          externalIds: JSON.stringify(item.externalIds),
        });
      },
    };
  },
});
