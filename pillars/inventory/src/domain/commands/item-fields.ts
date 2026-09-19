import { z } from 'zod';

import { ACCESS_STATES, LIFECYCLES, type ItemInsert, type ItemRow } from '../../db/index.js';
import { CommandRejected } from './errors.js';
import {
  placementSchema,
  previousPlacementSchema,
  type Placement,
  type PreviousPlacement,
} from './placement-schema.js';

import type { JsonValue } from './outcome.js';

export { placementSchema, previousPlacementSchema, type Placement, type PreviousPlacement };

/** How one wire field of an item is read from, and written to, its row. */
export interface FieldCodec<Row, Insert> {
  read(row: Row): JsonValue;
  /** Columns that store `value`. Throws `CommandRejected('invalid')` for a malformed value. */
  columns(value: JsonValue, now: string): Partial<Insert>;
}

/** Parse a field value with `schema`, refusing it as `invalid` when it does not fit. */
export function parseFieldValue<T>(schema: z.ZodType<T>, field: string, value: JsonValue): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CommandRejected('invalid', `invalid value for ${field}`);
  return parsed.data;
}

/** The wire placement of an item row. */
export function readPlacement(row: ItemRow): Placement {
  if (row.placementKind === 'location' && row.locationId !== null) {
    return { kind: 'location', locationId: row.locationId };
  }
  if (row.placementKind === 'container' && row.containingItemId !== null) {
    return { kind: 'container', itemId: row.containingItemId };
  }
  return { kind: 'hand' };
}

/** The wire previous placement of an item row. */
export function readPreviousPlacement(row: ItemRow): PreviousPlacement {
  if (row.previousPlacementKind === 'location' && row.previousLocationId !== null) {
    return { kind: 'location', locationId: row.previousLocationId };
  }
  if (row.previousPlacementKind === 'container' && row.previousContainingItemId !== null) {
    return { kind: 'container', itemId: row.previousContainingItemId };
  }
  return null;
}

type ItemCodec = FieldCodec<ItemRow, ItemInsert>;

const placementCodec: ItemCodec = {
  read: readPlacement,
  columns(value) {
    const placement = parseFieldValue(placementSchema, 'placement', value);
    return {
      placementKind: placement.kind,
      locationId: placement.kind === 'location' ? placement.locationId : null,
      containingItemId: placement.kind === 'container' ? placement.itemId : null,
    };
  },
};

const previousPlacementCodec: ItemCodec = {
  read: readPreviousPlacement,
  columns(value) {
    const previous = parseFieldValue(previousPlacementSchema, 'previousPlacement', value);
    return {
      previousPlacementKind: previous?.kind ?? null,
      previousLocationId: previous?.kind === 'location' ? previous.locationId : null,
      previousContainingItemId: previous?.kind === 'container' ? previous.itemId : null,
    };
  },
};

const accessCodec: ItemCodec = {
  read: (row) => row.access,
  columns: (value) => ({
    access: parseFieldValue(z.enum(ACCESS_STATES).nullable(), 'access', value),
  }),
};

const isFullCodec: ItemCodec = {
  read: (row) => (row.isFull === null ? null : row.isFull === 1),
  columns(value) {
    const full = parseFieldValue(z.boolean().nullable(), 'isFull', value);
    return { isFull: full === null ? null : Number(full) };
  },
};

const lifecycleCodec: ItemCodec = {
  read: (row) => row.lifecycle,
  columns: (value, now) => ({
    lifecycle: parseFieldValue(z.enum(LIFECYCLES), 'lifecycle', value),
    lifecycleChangedAt: now,
  }),
};

const deletedAtCodec: ItemCodec = {
  read: (row) => row.deletedAt,
  columns: (value) => ({ deletedAt: parseFieldValue(z.string().nullable(), 'deletedAt', value) }),
};

/** An item's `fields` JSON blob as the wire and the event log spell it: an object keyed by field name. */
export const itemFieldsBlobSchema = z.record(z.string(), z.json());

const nameCodec: ItemCodec = {
  read: (row) => row.name,
  columns: (value) => ({ name: parseFieldValue(z.string().trim().min(1), 'name', value) }),
};

/**
 * A note exactly as a client sends it (POPS-4053): empty or whitespace-only
 * becomes `null` rather than a 400, since a client clearing a note by
 * blanking the field is not an error. Anything else is kept byte for byte —
 * no trimming of indentation or trailing newlines a person may have typed on
 * purpose.
 */
export function normalizeNote(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim().length > 0 ? value : null;
}

const noteCodec: ItemCodec = {
  read: (row) => row.note,
  columns: (value) => ({
    note: normalizeNote(parseFieldValue(z.string().nullable(), 'note', value)),
  }),
};

const fieldsCodec: ItemCodec = {
  read: (row) => JSON.parse(row.fields) as JsonValue,
  columns: (value) => ({
    fields: JSON.stringify(parseFieldValue(itemFieldsBlobSchema, 'fields', value)),
  }),
};

/** An item's external ids: cross-references such as a manufacturer serial number. */
export const externalIdsSchema = z.array(
  z.object({ kind: z.string().min(1), value: z.string().min(1) })
);

const externalIdsCodec: ItemCodec = {
  read: (row) => JSON.parse(row.externalIds) as JsonValue,
  columns: (value) => ({
    externalIds: JSON.stringify(parseFieldValue(externalIdsSchema, 'externalIds', value)),
  }),
};

const quantityCodec: ItemCodec = {
  read: (row) => row.quantity,
  columns: (value) => ({ quantity: parseFieldValue(z.number().int().min(1), 'quantity', value) }),
};

const codeCodec: ItemCodec = {
  read: (row) => row.code,
  columns: (value) => ({
    code: parseFieldValue(z.string().trim().min(1).max(64).nullable(), 'code', value),
  }),
};

const typeKeyCodec: ItemCodec = {
  read: (row) => row.typeKey,
  columns: (value) => ({
    typeKey: parseFieldValue(z.string().min(1).nullable(), 'typeKey', value),
  }),
};

const isContainerCodec: ItemCodec = {
  read: (row) => row.isContainer === 1,
  columns: (value) => ({ isContainer: Number(parseFieldValue(z.boolean(), 'isContainer', value)) }),
};

/**
 * Write-only: `item.restoreDeleted` uses this to drop a `sourceRef` a live
 * item has since claimed (POPS-4053). No op sets a non-null value through
 * this codec; `item.create`'s own `sourceRef` bypasses the codec system
 * entirely, since a create has no prior value to diff against.
 */
const sourceRefCodec: ItemCodec = {
  read: (row) => row.sourceRef,
  columns: (value) => ({
    sourceRef: parseFieldValue(z.string().nullable(), 'sourceRef', value),
  }),
};

/**
 * Every item field the command layer can write, keyed by its wire name (the
 * name events record). `placement` is one field, so a move is compared as a
 * whole; `previousPlacement` moves with it whenever an item enters or leaves
 * the hand. `fields` and `externalIds` are recorded and compared as whole
 * JSON blobs: `item.edit`'s per-key `fields` patch is resolved to the full
 * blob before it reaches the engine (see `item-edit.ts`).
 */
export const ITEM_FIELD_CODECS: Readonly<Record<string, ItemCodec>> = {
  placement: placementCodec,
  previousPlacement: previousPlacementCodec,
  access: accessCodec,
  isFull: isFullCodec,
  lifecycle: lifecycleCodec,
  deletedAt: deletedAtCodec,
  name: nameCodec,
  note: noteCodec,
  fields: fieldsCodec,
  externalIds: externalIdsCodec,
  quantity: quantityCodec,
  code: codeCodec,
  typeKey: typeKeyCodec,
  isContainer: isContainerCodec,
  sourceRef: sourceRefCodec,
};
