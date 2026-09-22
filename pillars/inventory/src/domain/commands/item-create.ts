import { z } from 'zod';

import { replaceItemFieldValues, resolveProtocol1Type } from '../../catalogue/index.js';
import { items } from '../../db/index.js';
import { CommandRejected } from './errors.js';
import {
  externalIdsSchema,
  itemFieldsBlobSchema,
  normalizeNote,
  placementSchema,
} from './item-fields.js';
import { LEGACY_ITEM_FIELD_CODECS, legacyItemPatchSchema } from './legacy-item-fields.js';
import { defineOp } from './op.js';
import { assertPlacementAllowed } from './placement.js';
import { assertProtocol1Fields } from './protocol-1-fields.js';
import { upsertSearchIndex } from './search-index.js';

import type { ItemInsert } from '../../db/index.js';
import type { WriteStamp, FieldValues } from './entities.js';
import type { CommandDb } from './entities.js';

const createArgs = z.object({
  item: z.object({
    name: z.string().trim().min(1),
    typeKey: z.string().min(1).nullish(),
    fields: itemFieldsBlobSchema.default({}),
    /** Empty or whitespace-only becomes `null`; otherwise kept exactly as sent (POPS-4053). */
    note: z.string().nullish().transform(normalizeNote),
    externalIds: externalIdsSchema.default([]),
    quantity: z.number().int().min(1).default(1),
    placement: placementSchema.default({ kind: 'hand' }),
  }),
  /**
   * The legacy provenance and value columns (POPS-4053), set unvalidated
   * against the new model — there is no type to check them against. Absent
   * from every caller but the legacy `/items` routes.
   */
  legacy: legacyItemPatchSchema.optional(),
  /** The legacy `assetId` (`items.code`), written unvalidated: the legacy routes never checked it either, relying on the column's own unique index. */
  code: z.string().nullable().optional(),
  /** Idempotency key for a fan-out create (POPS-2433); unique when supplied. */
  sourceRef: z.string().nullable().optional(),
});

type CreateItemInput = z.infer<typeof createArgs>['item'];

/** The defined entries of a legacy patch, suitable for an event's `changes`. */
function definedLegacyFields(
  legacy: z.infer<typeof legacyItemPatchSchema> | undefined
): FieldValues {
  const result: FieldValues = {};
  if (!legacy) return result;
  for (const [field, value] of Object.entries(legacy)) {
    if (value !== undefined) result[field] = value;
  }
  return result;
}

/** The insert columns for whichever legacy fields `legacy` names. */
function legacyItemColumns(
  legacy: z.infer<typeof legacyItemPatchSchema> | undefined,
  now: string
): Partial<ItemInsert> {
  const columns: Partial<ItemInsert> = {};
  if (!legacy) return columns;
  for (const [field, value] of Object.entries(legacy)) {
    if (value === undefined) continue;
    const codec = LEGACY_ITEM_FIELD_CODECS[field];
    if (!codec) continue;
    Object.assign(columns, codec.columns(value, now));
  }
  return columns;
}

/** The item's current published type, or `undefined` for an untyped item. */
function resolveType(
  db: CommandDb,
  typeKey: string | null | undefined
): NonNullable<ReturnType<typeof resolveProtocol1Type>> | undefined {
  if (!typeKey) return undefined;
  const type = resolveProtocol1Type(db, typeKey);
  if (!type) throw new CommandRejected('type_unknown', `unknown type ${typeKey}`);
  return type;
}

/** Validate `fields` against `type` (or, untyped, require it empty: there is no schema to check it against). */
function assertFieldsFitType(
  db: CommandDb,
  type: NonNullable<ReturnType<typeof resolveProtocol1Type>> | undefined,
  fields: Record<string, unknown>
): void {
  if (type) {
    assertProtocol1Fields(db, type.id, fields);
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
  readonly type: NonNullable<ReturnType<typeof resolveProtocol1Type>> | undefined;
  readonly stamp: WriteStamp;
  readonly legacy?: z.infer<typeof legacyItemPatchSchema> | undefined;
  readonly code?: string | null | undefined;
  readonly sourceRef?: string | null | undefined;
}

function itemPlacementColumns(
  item: CreateItemInput
): Pick<ItemInsert, 'locationId' | 'containingItemId'> {
  if (item.placement.kind === 'location') {
    return { locationId: item.placement.locationId, containingItemId: null };
  }
  if (item.placement.kind === 'container') {
    return { locationId: null, containingItemId: item.placement.itemId };
  }
  return { locationId: null, containingItemId: null };
}

/** Insert the new item's row at `id`, with the placement and containment its type already validated. */
function insertItem({ db, id, item, type, stamp, legacy, code, sourceRef }: InsertItemArgs): void {
  const supportsContainment = type?.capabilities.includes('containment') ?? false;
  const values: ItemInsert = {
    id,
    name: item.name,
    typeId: type?.id ?? null,
    note: item.note ?? null,
    externalIds: JSON.stringify(item.externalIds),
    quantity: item.quantity,
    placementKind: item.placement.kind,
    ...itemPlacementColumns(item),
    isContainer: supportsContainment ? 1 : 0,
    access: supportsContainment ? 'open' : null,
    lastEditedTime: stamp.now,
    revision: stamp.revision,
    seq: stamp.seq,
    createdAt: stamp.now,
    updatedAt: stamp.now,
    ...legacyItemColumns(legacy, stamp.now),
  };
  if (code !== undefined) values.code = code;
  if (sourceRef !== undefined) values.sourceRef = sourceRef;
  db.insert(items).values(values).run();
  if (type) {
    replaceItemFieldValues(db, {
      itemId: id,
      typeId: type.id,
      fields: item.fields,
      catalogueRevision: type.revision,
      now: stamp.now,
    });
  }
}

/**
 * `item.create { item, legacy?, code?, sourceRef? }`: mint a new item at the
 * id the client already chose (`entityId`, validated as a UUID here since
 * new ids are exactly what D6 requires clients to mint). `typeKey` absent
 * leaves the item untyped, in which case `fields` must be empty: there is no
 * schema to validate it against. `is_container`, `access` and `is_full` are
 * never taken from the client; they follow from the type's `containment`
 * capability (ADR-002 D1).
 *
 * `legacy`, `code` and `sourceRef` exist for the legacy `/items` routes
 * (POPS-4053): the provenance and value columns the new model has no field
 * for, the sticker code (unvalidated here, unlike `item.setCode`, matching
 * what the legacy route always did), and the fan-out idempotency key. A
 * `sourceRef` collision raises the column's own unique-index error rather
 * than a typed outcome; the legacy route catches it and returns the
 * existing row, exactly as it did before this slice moved the route onto
 * the command layer.
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
    const type = resolveType(ctx.db, item.typeKey);
    assertFieldsFitType(ctx.db, type, item.fields);
    assertPlacementAllowed(ctx.db, ctx.mutation.entityId, item.placement);
    const isContainer = type?.capabilities.includes('containment') ?? false;

    return {
      eventKind: 'created',
      changes: {
        name: item.name,
        typeKey: type?.key ?? null,
        fields: item.fields,
        note: item.note ?? null,
        externalIds: item.externalIds,
        quantity: item.quantity,
        placement: item.placement,
        isContainer,
        ...definedLegacyFields(args.legacy),
        ...(args.code !== undefined ? { code: args.code } : {}),
      },
      insert: (db, stamp) =>
        insertItem({
          db,
          id: ctx.mutation.entityId,
          item,
          type,
          stamp,
          legacy: args.legacy,
          code: args.code,
          sourceRef: args.sourceRef,
        }),
      effects(effectCtx) {
        upsertSearchIndex(effectCtx.db, {
          id: ctx.mutation.entityId,
          name: item.name,
          code: args.code ?? null,
          note: item.note ?? null,
          typeId: type?.id ?? null,
          externalIds: JSON.stringify(item.externalIds),
        });
      },
    };
  },
});
