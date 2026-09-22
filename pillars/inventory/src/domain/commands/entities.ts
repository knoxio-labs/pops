import { eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  clearItemFieldValues,
  loadProtocol1Fields,
  replaceItemFieldValues,
  resolveProtocol1Type,
  resolveProtocol1TypeById,
} from '../../catalogue/index.js';
import { items, locations } from '../../db/schema.js';
import { CommandRejected } from './errors.js';
import { itemFieldsBlobSchema, ITEM_FIELD_CODECS, parseFieldValue } from './item-fields.js';
import { LEGACY_ITEM_FIELD_CODECS } from './legacy-item-fields.js';
import { LOCATION_FIELD_CODECS } from './location-fields.js';
import { protocol1FieldsAsJson } from './protocol-1-fields.js';

import type { RunResult } from 'better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { ItemInsert, ItemRow, LocationInsert, LocationRow } from '../../db/row-types.js';
import type { JsonValue } from './outcome.js';

/** A synchronous drizzle handle: the database or a transaction (or savepoint) on it. */
export type CommandDb = BaseSQLiteDatabase<'sync', RunResult, Record<string, unknown>>;

/** The revisioned entities a mutation can address. */
export type EntityKind = 'item' | 'location';

/** Wire field name to value, in the order an op produced them. */
export type FieldValues = Record<string, JsonValue>;

/** A revisioned row as the engine and the ops see it. */
export type LoadedEntity =
  | { readonly kind: 'item'; readonly row: ItemRow }
  | { readonly kind: 'location'; readonly row: LocationRow };

/** Load the entity `id` of `kind`, or `null` when no such row exists (tombstones included). */
export function loadEntity(db: CommandDb, kind: EntityKind, id: string): LoadedEntity | null {
  if (kind === 'item') {
    const row = db.select().from(items).where(eq(items.id, id)).get();
    return row ? { kind, row } : null;
  }
  const row = db.select().from(locations).where(eq(locations.id, id)).get();
  return row ? { kind, row } : null;
}

/** The item row of an op's target; an op declared on items only ever receives one. */
export function requireItem(target: LoadedEntity): ItemRow {
  if (target.kind !== 'item') throw new CommandRejected('invalid', 'this op applies to items only');
  return target.row;
}

/** The location row of an op's target; an op declared on locations only ever receives one. */
export function requireLocation(target: LoadedEntity): LocationRow {
  if (target.kind !== 'location') {
    throw new CommandRejected('invalid', 'this op applies to locations only');
  }
  return target.row;
}

/**
 * Every item field the command layer can write: the new model's own fields
 * plus the legacy provenance and value columns the `/items` routes still
 * expose (POPS-4053).
 */
const ALL_ITEM_FIELD_CODECS = { ...ITEM_FIELD_CODECS, ...LEGACY_ITEM_FIELD_CODECS };

/** Whether `field` is a wire field the command layer can write on `kind`. */
export function isWritableField(kind: EntityKind, field: string): boolean {
  if (kind === 'item' && (field === 'fields' || field === 'typeKey')) return true;
  const codecs = kind === 'item' ? ALL_ITEM_FIELD_CODECS : LOCATION_FIELD_CODECS;
  return Object.hasOwn(codecs, field);
}

/** The current wire value of `field` on a loaded entity. */
export function currentValue(db: CommandDb, entity: LoadedEntity, field: string): JsonValue {
  if (entity.kind === 'item') {
    if (field === 'fields') return protocol1FieldsAsJson(loadProtocol1Fields(db, entity.row.id));
    if (field === 'typeKey') {
      if (entity.row.typeId === null) return null;
      const type = resolveProtocol1TypeById(db, entity.row.typeId);
      if (!type) throw new CommandRejected('type_unknown', `unknown type ${entity.row.typeId}`);
      return type.key;
    }
    const codec = ALL_ITEM_FIELD_CODECS[field];
    if (!codec) throw new CommandRejected('invalid', `item has no writable field ${field}`);
    return codec.read(entity.row);
  }
  const codec = LOCATION_FIELD_CODECS[field];
  if (!codec) throw new CommandRejected('invalid', `location has no writable field ${field}`);
  return codec.read(entity.row);
}

/** What a write stamps on the row besides the changed fields. */
export interface WriteStamp {
  readonly revision: number;
  readonly seq: number;
  readonly now: string;
}

function itemColumns(db: CommandDb, changes: FieldValues, now: string): Partial<ItemInsert> {
  const columns: Partial<ItemInsert> = {};
  for (const [field, value] of Object.entries(changes)) {
    if (field === 'fields') continue;
    if (field === 'typeKey') {
      const typeKey = parseFieldValue(z.string().min(1).nullable(), field, value);
      const type = typeKey === null ? null : resolveProtocol1Type(db, typeKey);
      if (typeKey !== null && type === null) {
        throw new CommandRejected('type_unknown', `unknown type ${typeKey}`);
      }
      columns.typeId = type?.id ?? null;
      continue;
    }
    const codec = ALL_ITEM_FIELD_CODECS[field];
    if (!codec) throw new CommandRejected('invalid', `item has no writable field ${field}`);
    Object.assign(columns, codec.columns(value, now));
  }
  return columns;
}

function resolveProtocol1FieldsType(
  db: CommandDb,
  entity: Extract<LoadedEntity, { readonly kind: 'item' }>,
  requestedTypeKey: JsonValue | undefined
): ReturnType<typeof resolveProtocol1TypeById> {
  if (requestedTypeKey !== undefined) {
    const key = parseFieldValue(z.string().min(1).nullable(), 'typeKey', requestedTypeKey);
    return key === null ? null : resolveProtocol1Type(db, key);
  }
  if (entity.row.typeId === null) return null;
  return resolveProtocol1TypeById(db, entity.row.typeId);
}

/** Replace an item's authoritative stored fields when a protocol-1 whole-field write changed them. */
function replaceProtocol1Fields(
  db: CommandDb,
  entity: Extract<LoadedEntity, { readonly kind: 'item' }>,
  changes: FieldValues,
  now: string
): void {
  const fields = changes['fields'];
  if (fields === undefined) return;
  const parsedFields = parseFieldValue(itemFieldsBlobSchema, 'fields', fields);
  const requestedTypeKey = changes['typeKey'];
  const type = resolveProtocol1FieldsType(db, entity, requestedTypeKey);
  if (requestedTypeKey === undefined && entity.row.typeId !== null && type === null) {
    throw new CommandRejected('type_unknown', `unknown type ${entity.row.typeId}`);
  }
  if (type === null) {
    if (Object.keys(parsedFields).length > 0) {
      throw new CommandRejected('invalid', 'an untyped item cannot carry fields');
    }
    clearItemFieldValues(db, { itemId: entity.row.id });
    return;
  }
  replaceItemFieldValues(db, {
    itemId: entity.row.id,
    typeId: type.id,
    fields: parsedFields,
    catalogueRevision: type.revision,
    now,
  });
}

function locationColumns(changes: FieldValues, now: string): Partial<LocationInsert> {
  const columns: Partial<LocationInsert> = {};
  for (const [field, value] of Object.entries(changes)) {
    const codec = LOCATION_FIELD_CODECS[field];
    if (!codec) throw new CommandRejected('invalid', `location has no writable field ${field}`);
    Object.assign(columns, codec.columns(value, now));
  }
  return columns;
}

/**
 * Write `changes` onto an existing row in one UPDATE, with its new revision,
 * the `seq` of the event that records the change, and the server time.
 */
export function writeEntity(
  db: CommandDb,
  entity: LoadedEntity,
  changes: FieldValues,
  stamp: WriteStamp
): void {
  const common = { revision: stamp.revision, seq: stamp.seq, updatedAt: stamp.now };
  if (entity.kind === 'item') {
    db.update(items)
      .set({ ...itemColumns(db, changes, stamp.now), ...common, lastEditedTime: stamp.now })
      .where(eq(items.id, entity.row.id))
      .run();
    replaceProtocol1Fields(db, entity, changes, stamp.now);
    return;
  }
  db.update(locations)
    .set({ ...locationColumns(changes, stamp.now), ...common, lastEditedTime: stamp.now })
    .where(eq(locations.id, entity.row.id))
    .run();
}
